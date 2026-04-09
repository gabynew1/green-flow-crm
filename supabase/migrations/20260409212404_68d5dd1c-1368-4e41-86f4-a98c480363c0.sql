
-- Drop the old CHECK constraint
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_subscription_tier_check;

-- Add new CHECK constraint with correct tiers
ALTER TABLE public.tenants ADD CONSTRAINT tenants_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'trial', 'professional', 'enterprise'));

-- Update any existing rows that use 'starter' to 'professional'
UPDATE public.tenants SET subscription_tier = 'professional' WHERE subscription_tier = 'starter';
