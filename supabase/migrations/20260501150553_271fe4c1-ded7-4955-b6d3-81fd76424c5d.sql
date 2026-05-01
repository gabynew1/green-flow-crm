
-- Drop old check constraint
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_subscription_tier_check;

-- Add new columns
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_teams integer NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS ai_tier text NOT NULL DEFAULT 'full';

-- Migrate existing tier values BEFORE adding new constraint
UPDATE public.tenants
SET subscription_tier = CASE
  WHEN subscription_tier = 'trial'        THEN 'territory_trial'
  WHEN subscription_tier = 'free'         THEN 'patio'
  WHEN subscription_tier = 'professional' THEN 'estate'
  WHEN subscription_tier = 'enterprise'   THEN 'territory'
  ELSE subscription_tier
END;

-- Add new check constraint
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_subscription_tier_check
  CHECK (subscription_tier IN ('patio','backyard','estate','territory','territory_trial'));

-- apply_tier_limits helper
CREATE OR REPLACE FUNCTION public.apply_tier_limits(_tenant_id uuid, _tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_teams int;
  v_seats int;
  v_ai text;
BEGIN
  CASE _tier
    WHEN 'patio'            THEN v_max_teams := 0;   v_seats := 1;   v_ai := 'none';
    WHEN 'backyard'         THEN v_max_teams := 2;   v_seats := 4;   v_ai := 'standard';
    WHEN 'estate'           THEN v_max_teams := 5;   v_seats := 10;  v_ai := 'advanced';
    WHEN 'territory'        THEN v_max_teams := 999; v_seats := 999; v_ai := 'full';
    WHEN 'territory_trial'  THEN v_max_teams := 999; v_seats := 999; v_ai := 'full';
    ELSE                          v_max_teams := 0;   v_seats := 1;   v_ai := 'none';
  END CASE;

  UPDATE public.tenants
  SET subscription_tier = _tier,
      max_teams = v_max_teams,
      max_provider_seats = v_seats,
      ai_tier = v_ai,
      updated_at = now()
  WHERE id = _tenant_id;
END;
$$;

-- Default-trial trigger for new tenants
CREATE OR REPLACE FUNCTION public.set_default_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_tier IS NULL OR NEW.subscription_tier IN ('trial','free') THEN
    NEW.subscription_tier := 'territory_trial';
  END IF;
  IF NEW.trial_expires_at IS NULL THEN
    NEW.trial_expires_at := now() + interval '90 days';
  END IF;
  IF NEW.subscription_tier = 'territory_trial' THEN
    NEW.max_teams := 999;
    NEW.max_provider_seats := 999;
    NEW.ai_tier := 'full';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_default_trial ON public.tenants;
CREATE TRIGGER trg_tenants_default_trial
  BEFORE INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_default_trial();

-- Backfill trial expiry for trial tenants
UPDATE public.tenants
SET trial_expires_at = COALESCE(trial_expires_at, created_at + interval '90 days')
WHERE subscription_tier = 'territory_trial';

-- Apply limits to all existing tenants
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, subscription_tier FROM public.tenants LOOP
    PERFORM public.apply_tier_limits(r.id, r.subscription_tier);
  END LOOP;
END $$;

-- trial_extensions audit table
CREATE TABLE IF NOT EXISTS public.trial_extensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  extended_by uuid NOT NULL,
  days integer NOT NULL DEFAULT 15,
  new_expiry timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can read trial extensions" ON public.trial_extensions;
CREATE POLICY "Super admins can read trial extensions" ON public.trial_extensions
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can insert trial extensions" ON public.trial_extensions;
CREATE POLICY "Super admins can insert trial extensions" ON public.trial_extensions
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

-- extend_trial_15 RPC
CREATE OR REPLACE FUNCTION public.extend_trial_15(_tenant_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_expiry timestamptz;
  v_current timestamptz;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can extend trials';
  END IF;

  SELECT trial_expires_at INTO v_current FROM public.tenants WHERE id = _tenant_id;
  IF v_current IS NULL OR v_current < now() THEN
    v_new_expiry := now() + interval '15 days';
  ELSE
    v_new_expiry := v_current + interval '15 days';
  END IF;

  UPDATE public.tenants
  SET trial_expires_at = v_new_expiry,
      subscription_tier = 'territory_trial',
      updated_at = now()
  WHERE id = _tenant_id;

  PERFORM public.apply_tier_limits(_tenant_id, 'territory_trial');

  INSERT INTO public.trial_extensions (tenant_id, extended_by, days, new_expiry)
  VALUES (_tenant_id, auth.uid(), 15, v_new_expiry);

  PERFORM public.log_super_admin_action('trial_extended_15d', 'tenant', _tenant_id,
    jsonb_build_object('new_expiry', v_new_expiry));

  RETURN v_new_expiry;
END;
$$;

-- Daily expiry job
CREATE OR REPLACE FUNCTION public.expire_trials_to_patio()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.tenants
    WHERE subscription_tier = 'territory_trial'
      AND trial_expires_at IS NOT NULL
      AND trial_expires_at < now()
  LOOP
    PERFORM public.apply_tier_limits(r.id, 'patio');
  END LOOP;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-trials-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-trials-daily',
  '0 2 * * *',
  $$ SELECT public.expire_trials_to_patio(); $$
);
