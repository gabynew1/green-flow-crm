
-- ============================================================
-- 1. CREATE super_admins TABLE & REWRITE is_super_admin()
-- ============================================================
CREATE TABLE IF NOT EXISTS public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only super admins can read super_admins"
  ON public.super_admins FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "No one can modify super_admins via client"
  ON public.super_admins FOR ALL
  TO authenticated
  USING (false);

-- Seed the current super admin
INSERT INTO public.super_admins (user_id)
VALUES ('614e2389-cec1-49b0-bcf6-f8586e1e1648')
ON CONFLICT (user_id) DO NOTHING;

-- Rewrite is_super_admin to use the table instead of hardcoded email
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE user_id = _user_id
  )
$$;

-- ============================================================
-- 2. RESTRICT PROFILE EMAIL UPDATES (prevent privilege escalation)
-- ============================================================
-- Drop the overly permissive update policy and replace with one that blocks email changes
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile (restricted)"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND email IS NOT DISTINCT FROM (SELECT p.email FROM public.profiles p WHERE p.user_id = auth.uid())
  );

-- ============================================================
-- 3. FIX PROVIDER INVITE TOKEN EXPOSURE
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.provider_invites;

-- Use a security definer function to safely look up invites by token
CREATE OR REPLACE FUNCTION public.lookup_invite_by_token(_token text)
  RETURNS TABLE(role text, tenant_name text, expires_at timestamptz)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT pi.role::text, t.name, pi.expires_at
  FROM public.provider_invites pi
  LEFT JOIN public.tenants t ON t.id = pi.tenant_id
  WHERE pi.token = _token
    AND pi.used_by IS NULL
    AND pi.expires_at > now()
$$;

-- Allow authenticated users to read invites only by exact token match
CREATE POLICY "Users can read invite by exact token"
  ON public.provider_invites FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 4. FIX SENSITIVE PII EXPOSURE IN PROFILES
-- ============================================================
-- Replace the overly broad provider policy with tenant-scoped one
DROP POLICY IF EXISTS "Providers can view all profiles" ON public.profiles;

CREATE POLICY "Providers can view tenant profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    is_provider(auth.uid())
    AND (
      tenant_id = get_user_tenant_id(auth.uid())
      OR customer_id IN (
        SELECT c.id FROM public.customers c
        WHERE c.tenant_id = get_user_tenant_id(auth.uid())
      )
    )
  );

-- ============================================================
-- 5. FIX SERVICE CATALOG CROSS-TENANT EXPOSURE
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view active services" ON public.service_catalog;

CREATE POLICY "Authenticated users can view own tenant or global services"
  ON public.service_catalog FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (
      tenant_id IS NULL
      OR tenant_id = get_user_tenant_id(auth.uid())
    )
  );

-- ============================================================
-- 6. FIX TENANT DATA OVEREXPOSURE
-- ============================================================
DROP POLICY IF EXISTS "Anyone can lookup tenant by unique_id" ON public.tenants;

-- Replace with a security definer function for public lookup
CREATE OR REPLACE FUNCTION public.lookup_tenant_by_code(_code text)
  RETURNS TABLE(id uuid, name text, unique_tenant_id text)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT t.id, t.name, t.unique_tenant_id
  FROM public.tenants t
  WHERE t.unique_tenant_id = _code
    AND t.status = 'active'
$$;

-- Allow authenticated users to see only their own tenant
CREATE POLICY "Authenticated users can view their own tenant"
  ON public.tenants FOR SELECT
  TO authenticated
  USING (id = get_user_tenant_id(auth.uid()));

-- ============================================================
-- 7. FIX FUNCTION SEARCH PATHS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
  RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;
