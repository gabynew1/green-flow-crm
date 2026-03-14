
-- Admin Schema V2: Tiers, Feature Flags, and Global Oversight

-- 1. Extend tenants table with tiered licensing fields
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'BASIC' CHECK (subscription_tier IN ('BASIC', 'PREMIUM', 'PLATINUM')),
ADD COLUMN IF NOT EXISTS status text DEFAULT 'TRIAL' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TRIAL')),
ADD COLUMN IF NOT EXISTS trial_expires_at timestamptz,
ADD COLUMN IF NOT EXISTS feature_flags jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS max_provider_seats int DEFAULT 2,
ADD COLUMN IF NOT EXISTS max_client_seats int DEFAULT 50;

-- 2. Extend profiles with administrative controls and licensing
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS license_type text DEFAULT 'FULL' CHECK (license_type IN ('FULL', 'VIEWER')),
ADD COLUMN IF NOT EXISTS temporary_password text;

-- 3. Create Global Audit Log for Super Admin actions
CREATE TABLE IF NOT EXISTS public.super_admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES auth.users(id),
    target_tenant_id uuid REFERENCES public.tenants(id),
    target_user_id uuid REFERENCES auth.users(id),
    action_type text NOT NULL,
    action_details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.super_admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create Security Alerts table for monitoring failed logins/breaches
CREATE TABLE IF NOT EXISTS public.security_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES public.tenants(id),
    user_id uuid REFERENCES auth.users(id),
    event_type text NOT NULL, -- e.g., 'FAILED_LOGIN', 'UNUSUAL_IP', 'BULK_DATA_EXPORT'
    severity text CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    details jsonb DEFAULT '{}'::jsonb,
    is_resolved boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Super Admin tables
-- Only super admins can see these
CREATE POLICY "Super admins can manage audit logs" 
ON public.super_admin_audit_logs 
FOR ALL USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can manage security alerts" 
ON public.security_alerts 
FOR ALL USING (is_super_admin(auth.uid()));

-- 6. Helper function for "Login As" (Audit record trigger)
CREATE OR REPLACE FUNCTION public.log_super_admin_action()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.super_admin_audit_logs (admin_id, action_type, action_details)
    VALUES (auth.uid(), TG_ARGV[0], row_to_json(NEW)::jsonb);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
