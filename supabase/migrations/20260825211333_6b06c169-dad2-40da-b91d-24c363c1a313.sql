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

  -- pgmq.metrics_all() already returns *_msg_age_sec as integer seconds.
  SELECT jsonb_object_agg(queue_name, jsonb_build_object(
    'queue_length', queue_length,
    'newest_msg_age_sec', COALESCE(newest_msg_age_sec, 0)::int,
    'oldest_msg_age_sec', COALESCE(oldest_msg_age_sec, 0)::int,
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
  WHERE jobname IN ('process-email-queue', 'email-queue-heartbeat', 'purge-email-logs-daily');

  WITH inflight AS (
    SELECT vt FROM pgmq.q_auth_emails WHERE vt > now()
    UNION ALL
    SELECT vt FROM pgmq.q_transactional_emails WHERE vt > now()
  )
  SELECT COUNT(*)::int,
         COALESCE(MAX(EXTRACT(EPOCH FROM (now() - (vt - interval '30 seconds')))::int), 0)
  INTO v_in_flight, v_oldest_locked_sec
  FROM inflight;

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
    'pending', (
      SELECT COALESCE(SUM(queue_length),0)::int FROM pgmq.metrics_all()
      WHERE queue_name IN ('transactional_emails','auth_emails')
    ),
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