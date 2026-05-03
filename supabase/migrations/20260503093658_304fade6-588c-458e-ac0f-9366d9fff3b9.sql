CREATE OR REPLACE FUNCTION public.admin_email_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq', 'cron'
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
  v_oldest_pending_age int;
  v_cron_missing boolean;
  v_cron_inactive boolean;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  -- 1) Resend credential / domain alerts (403, forbidden, domain, api key) in last 6h
  SELECT
    COUNT(*),
    MAX(error_message)
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
      'message', format('%s send(s) failed in the last 6h with credential/domain errors. Check the Resend connector and verify send.greengrasscrm.ro is verified.', v_credential_failures),
      'detail', left(coalesce(v_credential_sample,''), 500),
      'count', v_credential_failures
    );
  END IF;

  -- 2) Rate-limit cooldown active
  SELECT retry_after_until INTO v_rate_limited_until
  FROM public.email_send_state
  WHERE id = 1;

  IF v_rate_limited_until IS NOT NULL AND v_rate_limited_until > now() THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','warning',
      'code','rate_limited',
      'title','Resend rate limit active',
      'message', format('Sending paused until %s due to Resend 429.', to_char(v_rate_limited_until, 'YYYY-MM-DD HH24:MI:SS UTC')),
      'detail', null
    );
  END IF;

  -- 3) Dead-letter queue depth
  SELECT COALESCE(queue_length, 0) INTO v_dlq_trans
  FROM pgmq.metrics_all() WHERE queue_name = 'transactional_emails_dlq';
  SELECT COALESCE(queue_length, 0) INTO v_dlq_auth
  FROM pgmq.metrics_all() WHERE queue_name = 'auth_emails_dlq';

  IF COALESCE(v_dlq_trans,0) + COALESCE(v_dlq_auth,0) > 0 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','warning',
      'code','dlq_buildup',
      'title','Messages in dead-letter queue',
      'message', format('%s transactional + %s auth message(s) waiting in DLQ. Review and replay or discard.',
                        COALESCE(v_dlq_trans,0), COALESCE(v_dlq_auth,0)),
      'detail', null,
      'count', COALESCE(v_dlq_trans,0) + COALESCE(v_dlq_auth,0)
    );
  END IF;

  -- 4) Recent failure rate (last 1h, deduplicated)
  WITH latest AS (
    SELECT DISTINCT ON (message_id) status
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND created_at >= now() - interval '1 hour'
    ORDER BY message_id, created_at DESC
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('failed','dlq','bounced','complained'))
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
        'detail', null
      );
    ELSIF v_failure_rate >= 0.2 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity','warning',
        'code','elevated_failure_rate',
        'title','Elevated email failure rate',
        'message', format('%s%% of emails failed in the last hour (%s of %s).',
                          ROUND(v_failure_rate * 100), v_recent_failures, v_recent_total),
        'detail', null
      );
    END IF;
  END IF;

  -- 5) Oldest pending email > 10 minutes (queue likely stalled)
  SELECT EXTRACT(EPOCH FROM (now() - MIN(oldest_msg_age_sec)))::int
  INTO v_oldest_pending_age
  FROM pgmq.metrics_all()
  WHERE queue_name IN ('transactional_emails','auth_emails')
    AND oldest_msg_age_sec IS NOT NULL;

  IF v_oldest_pending_age IS NOT NULL AND v_oldest_pending_age > 600 THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','warning',
      'code','queue_stalled',
      'title','Queue not draining',
      'message', format('Oldest pending email is %s minute(s) old. Check the process-email-queue cron job.',
                        ROUND(v_oldest_pending_age / 60.0)),
      'detail', null
    );
  END IF;

  -- 6) Cron job missing or inactive
  SELECT NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue')
  INTO v_cron_missing;

  IF v_cron_missing THEN
    v_alerts := v_alerts || jsonb_build_object(
      'severity','critical',
      'code','cron_missing',
      'title','Email dispatcher cron is missing',
      'message','process-email-queue is not scheduled. No emails will be sent until the cron job is recreated.',
      'detail', null
    );
  ELSE
    SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue' AND active = false)
    INTO v_cron_inactive;
    IF v_cron_inactive THEN
      v_alerts := v_alerts || jsonb_build_object(
        'severity','critical',
        'code','cron_inactive',
        'title','Email dispatcher cron is inactive',
        'message','process-email-queue is scheduled but disabled. Re-enable it to resume sending.',
        'detail', null
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'alerts', v_alerts,
    'generated_at', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_email_alerts() TO authenticated;