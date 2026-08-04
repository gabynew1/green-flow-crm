-- 1. Allow signed-in users to call the admin email reports.
--    Every function already raises unless public.is_super_admin(auth.uid()).
GRANT EXECUTE ON FUNCTION public.admin_email_activity_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_dlq(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_replay_dlq(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_discard_dlq(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_email_activity(text, text, text, timestamptz, timestamptz, integer, integer) TO authenticated;

-- 2. Expose the Resend reference + tenant mapping in the activity log.
DROP FUNCTION IF EXISTS public.admin_list_email_activity(text, text, text, timestamptz, timestamptz, integer, integer);

CREATE OR REPLACE FUNCTION public.admin_list_email_activity(
  p_status text DEFAULT NULL,
  p_template text DEFAULT NULL,
  p_recipient text DEFAULT NULL,
  p_since timestamptz DEFAULT (now() - interval '7 days'),
  p_until timestamptz DEFAULT now(),
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  message_id text,
  template_name text,
  recipient_email text,
  status text,
  error_message text,
  metadata jsonb,
  template_data jsonb,
  created_at timestamptz,
  tenant_id uuid,
  tenant_name text,
  resend_id text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (l.message_id)
      l.message_id, l.template_name, l.recipient_email, l.status,
      l.error_message, l.metadata, l.template_data, l.created_at, l.tenant_id
    FROM public.email_send_log l
    WHERE l.message_id IS NOT NULL
      AND l.created_at >= p_since
      AND l.created_at <= p_until
    ORDER BY l.message_id, l.created_at DESC
  ),
  filtered AS (
    SELECT * FROM latest
    WHERE (p_status IS NULL OR latest.status = p_status)
      AND (p_template IS NULL OR latest.template_name = p_template)
      AND (p_recipient IS NULL OR latest.recipient_email ILIKE '%' || p_recipient || '%')
  ),
  counted AS (SELECT COUNT(*) AS c FROM filtered)
  SELECT f.message_id, f.template_name, f.recipient_email, f.status,
         f.error_message, f.metadata, f.template_data, f.created_at,
         f.tenant_id,
         t.name AS tenant_name,
         NULLIF(f.metadata->>'resend_id', '') AS resend_id,
         (SELECT c FROM counted) AS total_count
  FROM filtered f
  LEFT JOIN public.tenants t ON t.id = f.tenant_id
  ORDER BY f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_email_activity(text, text, text, timestamptz, timestamptz, integer, integer) TO authenticated;

-- 3. Health: add worker heartbeat + DLQ velocity (pgmq only, no external calls).
CREATE OR REPLACE FUNCTION public.admin_email_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pgmq', 'cron'
AS $function$
DECLARE
  v_queues jsonb;
  v_throughput jsonb;
  v_cron jsonb;
  v_oldest_locked_sec int;
  v_in_flight int;
  v_dlq_today int;
  v_dlq_yesterday int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  SELECT jsonb_object_agg(queue_name, jsonb_build_object(
    'queue_length', queue_length,
    'newest_msg_age_sec', EXTRACT(EPOCH FROM (now() - newest_msg_age_sec))::int,
    'oldest_msg_age_sec', EXTRACT(EPOCH FROM (now() - oldest_msg_age_sec))::int,
    'total_messages', total_messages
  ))
  INTO v_queues
  FROM pgmq.metrics_all();

  WITH latest AS (
    SELECT DISTINCT ON (message_id) status, created_at
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND created_at >= now() - interval '24 hours'
    ORDER BY message_id, created_at DESC
  )
  SELECT jsonb_build_object(
    'last_24h_total', COUNT(*),
    'last_24h_sent', COUNT(*) FILTER (WHERE status = 'sent'),
    'last_24h_failed', COUNT(*) FILTER (WHERE status IN ('failed','dlq','bounced','complained')),
    'last_1h_total', COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour')
  ) INTO v_throughput
  FROM latest;

  SELECT jsonb_agg(jsonb_build_object(
    'jobname', jobname,
    'schedule', schedule,
    'active', active
  ))
  INTO v_cron
  FROM cron.job
  WHERE jobname IN ('process-email-queue', 'purge-email-logs-daily');

  -- Worker heartbeat: in-flight (locked) messages and how long the oldest has been locked
  WITH inflight AS (
    SELECT vt FROM pgmq.q_auth_emails WHERE vt > now()
    UNION ALL
    SELECT vt FROM pgmq.q_transactional_emails WHERE vt > now()
  )
  SELECT COUNT(*)::int,
         COALESCE(MAX(EXTRACT(EPOCH FROM (now() - (vt - interval '30 seconds')))::int), 0)
  INTO v_in_flight, v_oldest_locked_sec
  FROM inflight;

  -- DLQ velocity: messages landed today vs yesterday
  WITH dlq AS (
    SELECT enqueued_at FROM pgmq.q_auth_emails_dlq
    UNION ALL
    SELECT enqueued_at FROM pgmq.q_transactional_emails_dlq
  )
  SELECT
    COUNT(*) FILTER (WHERE enqueued_at >= date_trunc('day', now()))::int,
    COUNT(*) FILTER (WHERE enqueued_at >= date_trunc('day', now()) - interval '1 day'
                       AND enqueued_at <  date_trunc('day', now()))::int
  INTO v_dlq_today, v_dlq_yesterday
  FROM dlq;

  RETURN jsonb_build_object(
    'queues', COALESCE(v_queues, '{}'::jsonb),
    'throughput', COALESCE(v_throughput, '{}'::jsonb),
    'cron_jobs', COALESCE(v_cron, '[]'::jsonb),
    'worker', jsonb_build_object(
      'in_flight', COALESCE(v_in_flight, 0),
      'oldest_locked_sec', COALESCE(v_oldest_locked_sec, 0),
      'stalled', COALESCE(v_oldest_locked_sec, 0) > 300
    ),
    'dlq_velocity', jsonb_build_object(
      'today', COALESCE(v_dlq_today, 0),
      'yesterday', COALESCE(v_dlq_yesterday, 0)
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_email_health() TO authenticated;