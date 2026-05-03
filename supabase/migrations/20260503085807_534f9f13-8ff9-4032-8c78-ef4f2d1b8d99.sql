-- Phase 1: Email verification mirror + onboarding drip foundation

-- 1. profiles.email_verified mirror columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Backfill from auth.users for any user already confirmed
UPDATE public.profiles p
SET email_verified = true,
    email_verified_at = u.email_confirmed_at
FROM auth.users u
WHERE p.user_id = u.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.email_verified = false;

-- Trigger function on auth.users to mirror confirmation
CREATE OR REPLACE FUNCTION public.sync_email_verified_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at) THEN
    UPDATE public.profiles
    SET email_verified = true,
        email_verified_at = NEW.email_confirmed_at
    WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_email_verified_to_profile ON auth.users;
CREATE TRIGGER trg_sync_email_verified_to_profile
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_email_verified_to_profile();

-- 2. Tenant onboarding category toggle
ALTER TABLE public.tenant_email_settings
  ADD COLUMN IF NOT EXISTS cat_onboarding_enabled boolean NOT NULL DEFAULT true;

-- 3. Register the lifecycle category
INSERT INTO public.email_categories (key, display_name, description, is_required, sort_order)
VALUES ('lifecycle', 'Product tips & onboarding',
        'Occasional emails to help you get the most out of GreenGrass during your first week.',
        false, 50)
ON CONFLICT (key) DO NOTHING;

-- 4. Lifecycle step enum
DO $$ BEGIN
  CREATE TYPE public.lifecycle_step AS ENUM ('day_0', 'day_2', 'day_7');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Lifecycle email log
CREATE TABLE IF NOT EXISTS public.lifecycle_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid,
  step public.lifecycle_step NOT NULL,
  sent_at timestamptz,
  skipped_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, step)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_tenant ON public.lifecycle_email_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_step_sent ON public.lifecycle_email_log(step, sent_at);

ALTER TABLE public.lifecycle_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages lifecycle email log"
ON public.lifecycle_email_log
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Super admins read lifecycle email log"
ON public.lifecycle_email_log
FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));