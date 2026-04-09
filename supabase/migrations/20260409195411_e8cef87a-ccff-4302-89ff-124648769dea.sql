-- Update default subscription tier for new tenants to 'trial'
ALTER TABLE public.tenants ALTER COLUMN subscription_tier SET DEFAULT 'trial';

-- Update default license type for new profiles to 'trial'
ALTER TABLE public.profiles ALTER COLUMN license_type SET DEFAULT 'trial';