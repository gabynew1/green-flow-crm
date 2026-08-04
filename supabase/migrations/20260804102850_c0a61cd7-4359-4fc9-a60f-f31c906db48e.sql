-- 1) DLQ listing with the last known error for each stuck message
DROP FUNCTION IF EXISTS public.admin_list_dlq(text, integer);

CREATE OR REPLACE FUNCTION public.admin_list_dlq(p_queue text, p_limit integer DEFAULT 50)
RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamptz, vt timestamptz, message jsonb, last_error text, last_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq'
AS $function$
DECLARE
  v_dlq text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  IF p_queue NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue: %', p_queue;
  END IF;

  v_dlq := p_queue || '_dlq';

  RETURN QUERY EXECUTE format(
    $q$
    SELECT q.msg_id, q.read_ct, q.enqueued_at, q.vt, q.message,
           l.error_message, l.status
    FROM pgmq.q_%I q
    LEFT JOIN LATERAL (
      SELECT esl.error_message, esl.status
      FROM public.email_send_log esl
      WHERE esl.message_id IS NOT NULL
        AND esl.message_id = COALESCE(
              q.message->>'message_id',
              q.message->>'idempotency_key',
              q.message->>'id'
            )
      ORDER BY esl.created_at DESC
      LIMIT 1
    ) l ON true
    ORDER BY q.enqueued_at DESC
    LIMIT %L
    $q$, v_dlq, p_limit
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_dlq(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_dlq(text, integer) TO authenticated;

-- 2) Clear an expired / stuck Resend rate-limit cooldown
CREATE OR REPLACE FUNCTION public.admin_clear_email_rate_limit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_prev timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  SELECT retry_after_until INTO v_prev FROM public.email_send_state WHERE id = 1;
  UPDATE public.email_send_state SET retry_after_until = NULL, updated_at = now() WHERE id = 1;

  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, metadata)
  VALUES (auth.uid(), 'email_rate_limit_cleared', 'email_send_state',
          jsonb_build_object('previous_retry_after_until', v_prev));

  RETURN jsonb_build_object('success', true, 'previous_retry_after_until', v_prev);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_clear_email_rate_limit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_email_rate_limit() TO authenticated;

-- 3) Alerts: actionable + no false "cron missing" on the normal idle state
CREATE OR REPLACE FUNCTION public.admin_email_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alerts jsonb := '[]'::jsonb;
  v_recent_failures int;
  v_recent_total int;
  v_failure_rate numeric;
  v_credential_failures int;
  v_credential_sample text;
  v_rate_limited_until timestamptz;
  v_dlq_trans int;
  v_dlq_auth int;
  v_pending int;
  v_oldest_pending_age int;
  v_cron_present boolean;
  v_cron_inactive boolean;
  v_wake_present boolean;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  SELECT COUNT(*), MAX(error_message)
  INTO v_credential_failures, v_credential_sample
  FROM public.email_send_log
  WHERE created_at >= now() - interval '6 hours'
    AND status IN ('failed','dlq')
    AND error_message IS NOT NULL
    AND (
      error_message ILIKE '%403%'
      OR error_message ILIKE '%forbidden%'
      OR error_message ILIKE '%domain%'
      OR error_message ILIKE '%api key%'
      OR error_message ILIKE '%api_key%'
      OR error_message ILIKE '%unauthor%'
      OR error_message ILIKE '%not verified%'
    );

  IF v_credential_failures > 0 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','critical',
      'code','resend_credentials',
      'title','Resend credential or domain failure',
      'message', format('%s send(s) failed in the last 6h with credential/domain errors.', v_credential_failures),
      'detail', left(coalesce(v_credential_sample,''), 500),
      'count', v_credential_failures,
      'actions', jsonb_build_array(
        jsonb_build_object('code','verify_resend','label','Re-check Resend','variant','default'),
        jsonb_build_object('code','view_failures','label','View failures','variant','outline')
      )
    );
  END IF;

  SELECT retry_after_until INTO v_rate_limited_until
  FROM public.email_send_state WHERE id = 1;

  IF v_rate_limited_until IS NOT NULL AND v_rate_limited_until > now() THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','warning',
      'code','rate_limited',
      'title','Resend rate limit active',
      'message', format('Sending paused until %s due to Resend 429.', to_char(v_rate_limited_until, 'YYYY-MM-DD HH24:MI:SS UTC')),
      'detail', null,
      'actions', jsonb_build_array(
        jsonb_build_object('code','clear_rate_limit','label','Resume now','variant','default','confirm','This resumes sending immediately, even if Resend is still rate limiting. Continue?')
      )
    );
  END IF;

  SELECT COALESCE(queue_length, 0) INTO v_dlq_trans
  FROM pgmq.metrics_all() WHERE queue_name = 'transactional_emails_dlq';
  SELECT COALESCE(queue_length, 0) INTO v_dlq_auth
  FROM pgmq.metrics_all() WHERE queue_name = 'auth_emails_dlq';

  IF COALESCE(v_dlq_trans,0) + COALESCE(v_dlq_auth,0) > 0 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','warning',
      'code','dlq_buildup',
      'title','Messages in dead-letter queue',
      'message', format('%s transactional + %s auth message(s) are stuck. Retry them or clear them out.',
                        COALESCE(v_dlq_trans,0), COALESCE(v_dlq_auth,0)),
      'detail', null,
      'count', COALESCE(v_dlq_trans,0) + COALESCE(v_dlq_auth,0),
      'actions', jsonb_build_array(
        jsonb_build_object('code','retry_all_dlq','label','Retry all','variant','default'),
        jsonb_build_object('code','discard_all_dlq','label','Discard all','variant','destructive','confirm','This permanently deletes every dead-lettered email. They will never be sent. Continue?'),
        jsonb_build_object('code','review_dlq','label','Review','variant','outline')
      )
    );
  END IF;

  WITH latest AS (
    SELECT DISTINCT ON (message_id) status
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND created_at >= now() - interval '1 hour'
    ORDER BY message_id, created_at DESC
  )
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('failed','dlq','bounced','complained'))
  INTO v_recent_total, v_recent_failures
  FROM latest;

  IF v_recent_total >= 5 THEN
    v_failure_rate := (v_recent_failures::numeric / v_recent_total::numeric);
    IF v_failure_rate >= 0.5 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity','critical',
        'code','high_failure_rate',
        'title','High email failure rate',
        'message', format('%s%% of emails failed in the last hour (%s of %s).',
                          ROUND(v_failure_rate * 100), v_recent_failures, v_recent_total),
        'detail', null,
        'actions', jsonb_build_array(
          jsonb_build_object('code','view_failures','label','View failures','variant','default'),
          jsonb_build_object('code','verify_resend','label','Re-check Resend','variant','outline')
        )
      );
    ELSIF v_failure_rate >= 0.2 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity','warning',
        'code','elevated_failure_rate',
        'title','Elevated email failure rate',
        'message', format('%s%% of emails failed in the last hour (%s of %s).',
                          ROUND(v_failure_rate * 100), v_recent_failures, v_recent_total),
        'detail', null,
        'actions', jsonb_build_array(
          jsonb_build_object('code','view_failures','label','View failures','variant','outline')
        )
      );
    END IF;
  END IF;

  SELECT COALESCE(SUM(queue_length),0)::int, MAX(oldest_msg_age_sec)::int
  INTO v_pending, v_oldest_pending_age
  FROM pgmq.metrics_all()
  WHERE queue_name IN ('transactional_emails','auth_emails');

  IF v_oldest_pending_age IS NOT NULL AND v_oldest_pending_age > 600 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','warning',
      'code','queue_stalled',
      'title','Queue not draining',
      'message', format('Oldest pending email is %s minute(s) old.', ROUND(v_oldest_pending_age / 60.0)),
      'detail', null,
      'actions', jsonb_build_array(
        jsonb_build_object('code','run_dispatcher','label','Run dispatcher now','variant','default')
      )
    );
  END IF;

  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') INTO v_cron_present;
  SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue' AND active = false) INTO v_cron_inactive;
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname = 'email_queue_wake' AND NOT t.tgisinternal
  ) INTO v_wake_present;

  -- The dispatcher is on-demand: it is scheduled when mail is queued and
  -- unscheduled when the queues drain. Only alert when work is actually waiting.
  IF COALESCE(v_pending,0) > 0 AND NOT v_cron_present THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','critical',
      'code','cron_missing',
      'title','Emails are waiting but no dispatcher is running',
      'message', format('%s email(s) are queued and process-email-queue is not scheduled.', v_pending),
      'detail', null,
      'actions', jsonb_build_array(
        jsonb_build_object('code','run_dispatcher','label','Restart dispatcher','variant','default')
      )
    );
  ELSIF v_cron_inactive THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','critical',
      'code','cron_inactive',
      'title','Email dispatcher is disabled',
      'message','process-email-queue is scheduled but disabled. Re-enable it to resume sending.',
      'detail', null,
      'actions', jsonb_build_array(
        jsonb_build_object('code','run_dispatcher','label','Restart dispatcher','variant','default')
      )
    );
  END IF;

  IF NOT v_wake_present THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','critical',
      'code','wake_trigger_missing',
      'title','Email wake trigger is missing',
      'message','New emails will queue but nothing will start the dispatcher.',
      'detail', null,
      'actions', jsonb_build_array(
        jsonb_build_object('code','run_dispatcher','label','Run dispatcher now','variant','outline')
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'alerts', v_alerts,
    'pending', COALESCE(v_pending,0),
    'dlq_total', COALESCE(v_dlq_trans,0) + COALESCE(v_dlq_auth,0),
    'generated_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_email_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_email_alerts() TO authenticated;