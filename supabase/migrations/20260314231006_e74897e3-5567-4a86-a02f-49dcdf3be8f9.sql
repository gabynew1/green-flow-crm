
-- =============================================
-- Admin Schema V2: Extend tenants & profiles, create audit/security tables
-- =============================================

-- 1. Extend tenants table
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_tier text NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free','starter','professional','enterprise')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','trial','canceled')),
  ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_provider_seats integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_client_seats integer NOT NULL DEFAULT 50;

-- 2. Extend profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS license_type text NOT NULL DEFAULT 'standard'
    CHECK (license_type IN ('standard','trial','demo')),
  ADD COLUMN IF NOT EXISTS temporary_password text;

-- 3. Create super_admin_audit_logs table
CREATE TABLE IF NOT EXISTS public.super_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.super_admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view audit logs"
  ON public.super_admin_audit_logs FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert audit logs"
  ON public.super_admin_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

-- 4. Create security_alerts table
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text,
  related_user_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage security alerts"
  ON public.security_alerts FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- 5. Create log_super_admin_action function
CREATE OR REPLACE FUNCTION public.log_super_admin_action(
  _action text,
  _target_type text DEFAULT NULL,
  _target_id uuid DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, _metadata);
END;
$$;

-- 6. Update unique constraint on service_catalog for multi-tenant support
-- Drop existing unique constraint on code (find and drop it)
DO $$
BEGIN
  -- Try dropping common constraint names
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_catalog_code_key' AND conrelid = 'public.service_catalog'::regclass) THEN
    ALTER TABLE public.service_catalog DROP CONSTRAINT service_catalog_code_key;
  END IF;
END$$;

-- Create composite unique index that handles NULL tenant_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_catalog_code_tenant
  ON public.service_catalog (code, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'));
