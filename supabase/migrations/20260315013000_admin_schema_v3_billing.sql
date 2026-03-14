-- Admin Schema V3: Billing & Subscription Tiers
-- Adds a centralized table to manage pricing, limits, and features per tier.

-- 1. Create the subscription_plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    tier text PRIMARY KEY,
    name text NOT NULL,
    description text,
    monthly_price numeric(10, 2) NOT NULL DEFAULT 0.00,
    max_provider_seats integer NOT NULL DEFAULT 1,
    max_client_seats integer NOT NULL DEFAULT 10,
    feature_flags jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Super Admins can manage plans
CREATE POLICY "Super Admins can manage subscription plans"
    ON public.subscription_plans
    FOR ALL
    USING (public.is_super_admin());

-- Authenticated users (tenants) can view active plans
CREATE POLICY "Users can view active subscription plans"
    ON public.subscription_plans
    FOR SELECT
    USING (is_active = true);

-- Create updated_at trigger
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE PROCEDURE public.moddatetime (updated_at);

-- 2. Seed default plans
INSERT INTO public.subscription_plans (tier, name, description, monthly_price, max_provider_seats, max_client_seats, feature_flags)
VALUES
    ('BASIC', 'Basic Plan', 'Essential tools for small teams', 49.00, 2, 50, '{"api_access": false, "white_labeling": false, "custom_reports": false}'),
    ('PREMIUM', 'Premium Plan', 'Advanced features for growing businesses', 149.00, 10, 500, '{"api_access": true, "white_labeling": false, "custom_reports": true}'),
    ('PLATINUM', 'Platinum Plan', 'Unlimited power for enterprise teams', 299.00, 50, 999999, '{"api_access": true, "white_labeling": true, "custom_reports": true}')
ON CONFLICT (tier) DO UPDATE SET
    name = EXCLUDED.name,
    monthly_price = EXCLUDED.monthly_price,
    max_provider_seats = EXCLUDED.max_provider_seats,
    max_client_seats = EXCLUDED.max_client_seats;

-- 3. Create helper function for trial expiration checks
-- This function can be called via cron or manually to downgrade expired trials
CREATE OR REPLACE FUNCTION public.downgrade_expired_trials()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count integer;
BEGIN
    UPDATE public.tenants
    SET 
        status = 'ACTIVE',
        subscription_tier = 'BASIC',
        trial_expires_at = NULL
    WHERE 
        status = 'TRIAL' 
        AND trial_expires_at IS NOT NULL 
        AND trial_expires_at < now();
        
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;
