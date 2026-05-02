-- 1. Add template_data column for re-rendering
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS template_data jsonb;

-- 2. Index for retention purge + history queries
CREATE INDEX IF NOT EXISTS idx_email_send_log_created_at
  ON public.email_send_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient_created
  ON public.email_send_log (lower(recipient_email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_tenant_created
  ON public.email_send_log (tenant_id, created_at DESC);

-- 3. Purge function — deletes rows older than 365 days, logs to super_admin_audit_logs
CREATE OR REPLACE FUNCTION public.purge_old_email_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH d AS (
    DELETE FROM public.email_send_log
    WHERE created_at < now() - interval '365 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM d;

  -- Best-effort audit log
  BEGIN
    INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, metadata)
    VALUES (NULL, 'email_log_purge', 'email_send_log',
            jsonb_build_object('deleted_count', v_deleted, 'cutoff_days', 365));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_deleted;
END;
$$;

-- 4. RPC: current user's email history (deduplicated by message_id, latest per email)
CREATE OR REPLACE FUNCTION public.get_my_email_history(
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _category text DEFAULT NULL,
  _since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  message_id text,
  template_name text,
  category text,
  status text,
  recipient_email text,
  error_message text,
  created_at timestamptz,
  tenant_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT lower(p.email) INTO v_email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_email IS NULL THEN
    SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid() LIMIT 1;
  END IF;
  IF v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.message_id, l.template_name, l.category, l.status,
         l.recipient_email, l.error_message, l.created_at, l.tenant_id
  FROM (
    SELECT DISTINCT ON (message_id)
      message_id, template_name, category, status,
      recipient_email, error_message, created_at, tenant_id
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND lower(recipient_email) = v_email
      AND created_at >= now() - interval '365 days'
      AND (_since IS NULL OR created_at >= _since)
      AND (_category IS NULL OR category = _category)
    ORDER BY message_id, created_at DESC
  ) l
  ORDER BY l.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END;
$$;

-- 5. RPC: provider — email history for a customer in current tenant
CREATE OR REPLACE FUNCTION public.get_customer_email_history(
  _customer_id uuid,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  message_id text,
  template_name text,
  category text,
  status text,
  recipient_email text,
  error_message text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_provider(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT lower(c.email) INTO v_email
  FROM public.customers c
  WHERE c.id = _customer_id AND c.tenant_id = v_tenant
  LIMIT 1;
  IF v_email IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.message_id, l.template_name, l.category, l.status,
         l.recipient_email, l.error_message, l.created_at
  FROM (
    SELECT DISTINCT ON (message_id)
      message_id, template_name, category, status,
      recipient_email, error_message, created_at, tenant_id
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND lower(recipient_email) = v_email
      AND tenant_id = v_tenant
      AND created_at >= now() - interval '365 days'
    ORDER BY message_id, created_at DESC
  ) l
  ORDER BY l.created_at DESC
  LIMIT GREATEST(_limit, 1)
  OFFSET GREATEST(_offset, 0);
END;
$$;

-- 6. RPC: fetch a single email for the webview (caller = recipient or tenant admin)
CREATE OR REPLACE FUNCTION public.get_email_for_webview(_message_id text)
RETURNS TABLE (
  message_id text,
  template_name text,
  template_data jsonb,
  category text,
  status text,
  recipient_email text,
  created_at timestamptz,
  tenant_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_caller_email text;
  v_caller_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT DISTINCT ON (l.message_id)
    l.message_id, l.template_name, l.template_data, l.category,
    l.status, l.recipient_email, l.created_at, l.tenant_id
  INTO v_row
  FROM public.email_send_log l
  WHERE l.message_id = _message_id
    AND l.created_at >= now() - interval '365 days'
  ORDER BY l.message_id, l.created_at DESC
  LIMIT 1;

  IF v_row IS NULL THEN RETURN; END IF;

  SELECT lower(p.email) INTO v_caller_email FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_caller_email IS NULL THEN
    SELECT lower(u.email) INTO v_caller_email FROM auth.users u WHERE u.id = auth.uid() LIMIT 1;
  END IF;

  v_caller_tenant := public.get_user_tenant_id(auth.uid());

  IF lower(v_row.recipient_email) = COALESCE(v_caller_email, '')
     OR (v_row.tenant_id IS NOT NULL
         AND v_row.tenant_id = v_caller_tenant
         AND public.is_provider(auth.uid()))
     OR public.is_super_admin(auth.uid()) THEN
    message_id := v_row.message_id;
    template_name := v_row.template_name;
    template_data := v_row.template_data;
    category := v_row.category;
    status := v_row.status;
    recipient_email := v_row.recipient_email;
    created_at := v_row.created_at;
    tenant_id := v_row.tenant_id;
    RETURN NEXT;
  END IF;
  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_email_history(integer, integer, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_email_history(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_webview(text) TO authenticated;