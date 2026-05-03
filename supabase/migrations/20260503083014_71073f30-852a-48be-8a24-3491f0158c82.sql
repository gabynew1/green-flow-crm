-- =========================================================================
-- Pillar 3: SuperAdmin Email Operations RPCs
-- =========================================================================

-- ---- Index to speed up message_id dedup queries ----------------------------
CREATE INDEX IF NOT EXISTS idx_email_send_log_message_id_created
  ON public.email_send_log (message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_template_created
  ON public.email_send_log (template_name, created_at DESC);

-- ---- 1. List email activity (deduplicated by message_id) ------------------
CREATE OR REPLACE FUNCTION public.admin_list_email_activity(
  p_status text DEFAULT NULL,
  p_template text DEFAULT NULL,
  p_recipient text DEFAULT NULL,
  p_since timestamptz DEFAULT (now() - interval '7 days'),
  p_until timestamptz DEFAULT now(),
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  message_id text,
  template_name text,
  recipient_email text,
  status text,
  error_message text,
  metadata jsonb,
  template_data jsonb,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (l.message_id)
      l.message_id, l.template_name, l.recipient_email, l.status,
      l.error_message, l.metadata, l.template_data, l.created_at
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
  counted AS (
    SELECT COUNT(*) AS c FROM filtered
  )
  SELECT f.message_id, f.template_name, f.recipient_email, f.status,
         f.error_message, f.metadata, f.template_data, f.created_at,
         (SELECT c FROM counted) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_email_activity(
  text, text, text, timestamptz, timestamptz, int, int
) TO authenticated;

-- ---- 2. Email activity stats ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_email_activity_stats(
  p_since timestamptz DEFAULT (now() - interval '7 days'),
  p_until timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  WITH latest AS (
    SELECT DISTINCT ON (message_id) status
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND created_at >= p_since
      AND created_at <= p_until
    ORDER BY message_id, created_at DESC
  )
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'sent', COUNT(*) FILTER (WHERE status = 'sent'),
    'failed', COUNT(*) FILTER (WHERE status IN ('failed','bounced','complained')),
    'dlq', COUNT(*) FILTER (WHERE status = 'dlq'),
    'suppressed', COUNT(*) FILTER (WHERE status = 'suppressed'),
    'pending', COUNT(*) FILTER (WHERE status = 'pending')
  ) INTO result
  FROM latest;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_email_activity_stats(timestamptz, timestamptz)
  TO authenticated;

-- ---- 3. List DLQ messages -------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_dlq(
  p_queue text,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  msg_id bigint,
  read_ct int,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
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
    'SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.q_%I ORDER BY enqueued_at DESC LIMIT %L',
    v_dlq, p_limit
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_dlq(text, int) TO authenticated;

-- ---- 4. Replay a DLQ message ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_replay_dlq(
  p_queue text,
  p_msg_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_dlq text;
  v_message jsonb;
  v_new_msg_id bigint;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  IF p_queue NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue: %', p_queue;
  END IF;

  v_dlq := p_queue || '_dlq';

  -- Read the message
  EXECUTE format('SELECT message FROM pgmq.q_%I WHERE msg_id = %L', v_dlq, p_msg_id)
    INTO v_message;

  IF v_message IS NULL THEN
    RAISE EXCEPTION 'Message % not found in DLQ %', p_msg_id, v_dlq;
  END IF;

  -- Re-enqueue to main queue
  SELECT pgmq.send(p_queue, v_message) INTO v_new_msg_id;

  -- Delete from DLQ
  PERFORM pgmq.delete(v_dlq, p_msg_id);

  -- Audit
  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, metadata)
  VALUES (
    auth.uid(), 'email_dlq_replay', 'pgmq_message',
    jsonb_build_object('queue', p_queue, 'old_msg_id', p_msg_id, 'new_msg_id', v_new_msg_id)
  );

  RETURN jsonb_build_object('success', true, 'new_msg_id', v_new_msg_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_replay_dlq(text, bigint) TO authenticated;

-- ---- 5. Discard a DLQ message --------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_discard_dlq(
  p_queue text,
  p_msg_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  v_dlq text;
  v_message jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  IF p_queue NOT IN ('auth_emails', 'transactional_emails') THEN
    RAISE EXCEPTION 'Invalid queue: %', p_queue;
  END IF;

  v_dlq := p_queue || '_dlq';

  EXECUTE format('SELECT message FROM pgmq.q_%I WHERE msg_id = %L', v_dlq, p_msg_id)
    INTO v_message;

  PERFORM pgmq.delete(v_dlq, p_msg_id);

  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, metadata)
  VALUES (
    auth.uid(), 'email_dlq_discard', 'pgmq_message',
    jsonb_build_object('queue', p_queue, 'msg_id', p_msg_id, 'message', v_message)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_discard_dlq(text, bigint) TO authenticated;

-- ---- 6. Email infrastructure health --------------------------------------
CREATE OR REPLACE FUNCTION public.admin_email_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq, cron
AS $$
DECLARE
  v_queues jsonb;
  v_throughput jsonb;
  v_cron jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  -- Queue depths
  SELECT jsonb_object_agg(queue_name, jsonb_build_object(
    'queue_length', queue_length,
    'newest_msg_age_sec', EXTRACT(EPOCH FROM (now() - newest_msg_age_sec))::int,
    'oldest_msg_age_sec', EXTRACT(EPOCH FROM (now() - oldest_msg_age_sec))::int,
    'total_messages', total_messages
  ))
  INTO v_queues
  FROM pgmq.metrics_all();

  -- Throughput last 24h (deduplicated)
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

  -- Cron job status
  SELECT jsonb_agg(jsonb_build_object(
    'jobname', jobname,
    'schedule', schedule,
    'active', active
  ))
  INTO v_cron
  FROM cron.job
  WHERE jobname IN ('process-email-queue', 'purge-email-logs-daily');

  RETURN jsonb_build_object(
    'queues', COALESCE(v_queues, '{}'::jsonb),
    'throughput', COALESCE(v_throughput, '{}'::jsonb),
    'cron_jobs', COALESCE(v_cron, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_email_health() TO authenticated;

-- ---- 7. Resend email by message_id ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_resend_email(
  p_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log record;
  v_new_msg_id text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: super admin required';
  END IF;

  SELECT * INTO v_log
  FROM public.email_send_log
  WHERE message_id = p_message_id
    AND template_data IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_log IS NULL THEN
    RAISE EXCEPTION 'Email % not found or missing template data', p_message_id;
  END IF;

  v_new_msg_id := 'admin-resend-' || gen_random_uuid()::text;

  -- Audit BEFORE enqueue (so it's logged even if enqueue fails)
  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, metadata)
  VALUES (
    auth.uid(), 'email_resend', 'email_send_log',
    jsonb_build_object(
      'original_message_id', p_message_id,
      'new_message_id', v_new_msg_id,
      'template', v_log.template_name,
      'recipient', v_log.recipient_email
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_message_id', v_new_msg_id,
    'template_name', v_log.template_name,
    'recipient_email', v_log.recipient_email,
    'template_data', v_log.template_data
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resend_email(text) TO authenticated;