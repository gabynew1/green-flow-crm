
DROP FUNCTION IF EXISTS public.fn_expire_trials();

-- =========================================================================
-- 1. ENUM + columns
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE public.subscription_status_t AS ENUM
    ('trial_active','grace','active','downgraded','suspended','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS subscription_status public.subscription_status_t,
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz;

UPDATE public.tenants
SET subscription_status = CASE
  WHEN subscription_tier = 'territory_trial' AND trial_expires_at IS NOT NULL AND trial_expires_at > now()
    THEN 'trial_active'::public.subscription_status_t
  WHEN subscription_tier = 'territory_trial' AND trial_expires_at IS NOT NULL AND trial_expires_at <= now()
    THEN 'grace'::public.subscription_status_t
  ELSE 'active'::public.subscription_status_t
END,
grace_ends_at = CASE
  WHEN subscription_tier = 'territory_trial' AND trial_expires_at IS NOT NULL AND trial_expires_at <= now()
    THEN now() + interval '15 days'
  ELSE grace_ends_at
END
WHERE subscription_status IS NULL;

ALTER TABLE public.tenants ALTER COLUMN subscription_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_sub_status ON public.tenants (subscription_status);
CREATE INDEX IF NOT EXISTS idx_tenants_grace_ends_at ON public.tenants (grace_ends_at) WHERE grace_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_trial_expiry_active ON public.tenants (trial_expires_at) WHERE subscription_status = 'trial_active';

CREATE TABLE IF NOT EXISTS public.subscription_config (
  id smallint PRIMARY KEY CHECK (id = 1),
  grace_period_days int NOT NULL DEFAULT 15,
  trial_length_days int NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_config TO authenticated;
GRANT ALL ON public.subscription_config TO service_role;
ALTER TABLE public.subscription_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscription_config readable by authenticated" ON public.subscription_config;
CREATE POLICY "subscription_config readable by authenticated"
  ON public.subscription_config FOR SELECT TO authenticated USING (true);
INSERT INTO public.subscription_config (id, grace_period_days, trial_length_days)
VALUES (1, 15, 30) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.super_admin_audit_logs
  ADD COLUMN IF NOT EXISTS from_status text,
  ADD COLUMN IF NOT EXISTS to_status text,
  ADD COLUMN IF NOT EXISTS from_tier text,
  ADD COLUMN IF NOT EXISTS to_tier text,
  ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.super_admin_audit_logs ALTER COLUMN admin_user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_validate_tenant_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subscription_status = 'trial_active' THEN
    IF NEW.subscription_tier <> 'territory_trial' OR NEW.trial_expires_at IS NULL THEN
      RAISE EXCEPTION 'Invalid lifecycle: trial_active requires territory_trial tier + trial_expires_at (got tier=%, expires=%)', NEW.subscription_tier, NEW.trial_expires_at;
    END IF;
  ELSIF NEW.subscription_status = 'grace' THEN
    IF NEW.subscription_tier <> 'territory_trial' OR NEW.grace_ends_at IS NULL THEN
      RAISE EXCEPTION 'Invalid lifecycle: grace requires territory_trial tier + grace_ends_at (got tier=%, grace_ends_at=%)', NEW.subscription_tier, NEW.grace_ends_at;
    END IF;
  ELSIF NEW.subscription_status = 'active' THEN
    IF NEW.subscription_tier = 'territory_trial' THEN
      RAISE EXCEPTION 'Invalid lifecycle: active status cannot be paired with territory_trial tier';
    END IF;
  ELSIF NEW.subscription_status = 'downgraded' THEN
    IF NEW.subscription_tier <> 'patio' THEN
      RAISE EXCEPTION 'Invalid lifecycle: downgraded status requires patio tier (got %)', NEW.subscription_tier;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tenants_validate_lifecycle ON public.tenants;
CREATE TRIGGER trg_tenants_validate_lifecycle
  BEFORE INSERT OR UPDATE OF subscription_status, subscription_tier, trial_expires_at, grace_ends_at
  ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.fn_validate_tenant_lifecycle();

CREATE OR REPLACE FUNCTION public.fn_log_subscription_transition(
  p_tenant_id uuid, p_from_status text, p_to_status text,
  p_from_tier text, p_to_tier text, p_reason text,
  p_actor uuid, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.super_admin_audit_logs
    (admin_user_id, action, target_type, target_id, metadata,
     from_status, to_status, from_tier, to_tier, reason)
  VALUES (p_actor, 'subscription_transition', 'tenant', p_tenant_id,
     COALESCE(p_metadata,'{}'::jsonb),
     p_from_status, p_to_status, p_from_tier, p_to_tier, p_reason);
$$;
REVOKE ALL ON FUNCTION public.fn_log_subscription_transition(uuid,text,text,text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_subscription_transition(uuid,text,text,text,text,text,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_finalize_downgrade(
  p_tenant_id uuid, p_reason text DEFAULT 'manual_downgrade'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_super boolean;
  v_old_tier text;
  v_old_status text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT public.is_super_admin(v_uid) INTO v_is_super;
    IF NOT COALESCE(v_is_super, false) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT subscription_tier, subscription_status::text
    INTO v_old_tier, v_old_status
  FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF v_old_status NOT IN ('trial_active','grace') THEN RETURN; END IF;

  UPDATE public.tenants
     SET subscription_tier   = 'patio',
         subscription_status = 'downgraded',
         grace_ends_at       = NULL,
         trial_expires_at    = NULL,
         status              = CASE WHEN status = 'trial' THEN 'active' ELSE status END,
         updated_at          = now()
   WHERE id = p_tenant_id;

  PERFORM public.apply_tier_limits(p_tenant_id, 'patio');

  PERFORM public.fn_log_subscription_transition(
    p_tenant_id, v_old_status, 'downgraded', v_old_tier, 'patio',
    p_reason, v_uid, '{}'::jsonb
  );
END $$;
REVOKE ALL ON FUNCTION public.fn_finalize_downgrade(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_finalize_downgrade(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_expire_trials()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_to_grace int := 0;
  v_downgraded int := 0;
  v_grace_days int;
  r record;
BEGIN
  SELECT grace_period_days INTO v_grace_days FROM public.subscription_config WHERE id = 1;
  v_grace_days := COALESCE(v_grace_days, 15);

  FOR r IN
    SELECT id, subscription_tier, subscription_status::text AS status
    FROM public.tenants
    WHERE subscription_status = 'trial_active'
      AND trial_expires_at IS NOT NULL
      AND trial_expires_at <= now()
  LOOP
    UPDATE public.tenants
       SET subscription_status = 'grace',
           grace_ends_at = now() + (v_grace_days || ' days')::interval,
           updated_at = now()
     WHERE id = r.id;

    PERFORM public.fn_log_subscription_transition(
      r.id, r.status, 'grace', r.subscription_tier, r.subscription_tier,
      'trial_expired', NULL,
      jsonb_build_object('grace_period_days', v_grace_days)
    );
    v_to_grace := v_to_grace + 1;
  END LOOP;

  FOR r IN
    SELECT id FROM public.tenants
    WHERE subscription_status = 'grace'
      AND grace_ends_at IS NOT NULL
      AND grace_ends_at <= now()
  LOOP
    PERFORM public.fn_finalize_downgrade(r.id, 'automatic_downgrade');
    v_downgraded := v_downgraded + 1;
  END LOOP;

  RETURN jsonb_build_object('moved_to_grace', v_to_grace, 'auto_downgraded', v_downgraded);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_expire_trials() TO service_role;

CREATE OR REPLACE FUNCTION public.fn_grant_extra_trial(
  p_tenant_id uuid, p_days integer DEFAULT 30, p_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_old_tier text;
  v_old_status text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = v_uid) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT subscription_tier, subscription_status::text INTO v_old_tier, v_old_status
  FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  UPDATE public.tenants
     SET subscription_tier   = 'territory_trial',
         status              = 'trial',
         subscription_status = 'trial_active',
         grace_ends_at       = NULL,
         trial_expires_at    = GREATEST(COALESCE(trial_expires_at, now()), now())
                               + (p_days || ' days')::interval,
         feature_flags       = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object(
           'extra_trial_granted_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'extra_trial_reason', COALESCE(p_reason,'')
         ),
         updated_at          = now()
   WHERE id = p_tenant_id;

  PERFORM public.apply_tier_limits(p_tenant_id, 'territory_trial');

  PERFORM public.fn_log_subscription_transition(
    p_tenant_id, v_old_status, 'trial_active', v_old_tier, 'territory_trial',
    'trial_extended', v_uid, jsonb_build_object('days', p_days, 'reason', p_reason)
  );
END $$;

CREATE OR REPLACE FUNCTION public.fn_change_subscription_tier(
  p_tenant_id uuid, p_new_tier text
) RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_super boolean;
  v_old_tier text;
  v_old_status text;
  v_row public.tenants;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF p_new_tier NOT IN ('patio','backyard','estate','territory') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_new_tier USING ERRCODE = '22023';
  END IF;

  SELECT public.is_super_admin(v_uid) INTO v_is_super;
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = v_uid AND ur.role = 'PROVIDER_ADMIN' AND p.tenant_id = p_tenant_id
  ) INTO v_is_admin;
  IF NOT (v_is_admin OR COALESCE(v_is_super, false)) THEN
    RAISE EXCEPTION 'Only provider admins can change the subscription tier' USING ERRCODE = '42501';
  END IF;

  SELECT subscription_tier, subscription_status::text INTO v_old_tier, v_old_status
  FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  IF p_new_tier = 'patio' AND v_old_tier <> 'patio' THEN
    PERFORM public.fn_finalize_downgrade(p_tenant_id, 'manual_downgrade');
    SELECT * INTO v_row FROM public.tenants WHERE id = p_tenant_id;
    RETURN v_row;
  END IF;

  UPDATE public.tenants
     SET subscription_tier   = p_new_tier,
         subscription_status = 'active',
         grace_ends_at       = NULL,
         trial_expires_at    = NULL,
         status              = CASE WHEN status = 'trial' THEN 'active' ELSE status END,
         updated_at          = now()
   WHERE id = p_tenant_id
   RETURNING * INTO v_row;

  PERFORM public.apply_tier_limits(p_tenant_id, p_new_tier);

  PERFORM public.fn_log_subscription_transition(
    p_tenant_id, v_old_status, 'active', v_old_tier, p_new_tier,
    'upgrade', v_uid, '{}'::jsonb
  );

  INSERT INTO public.activity_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, v_uid, 'TIER_CHANGED', 'tenant', p_tenant_id,
    jsonb_build_object('old_tier', v_old_tier, 'new_tier', p_new_tier));

  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.fn_get_tenant_entitlements(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier text;
  v_status text;
  v_grace_ends timestamptz;
  v_trial_ends timestamptz;
  v_effective text;
  v_result jsonb := '{}'::jsonb;
  r record;
BEGIN
  SELECT subscription_tier, subscription_status::text, grace_ends_at, trial_expires_at
    INTO v_tier, v_status, v_grace_ends, v_trial_ends
  FROM public.tenants WHERE id = p_tenant_id;

  IF v_tier IS NULL THEN v_tier := 'patio'; END IF;
  IF v_status IS NULL THEN v_status := 'active'; END IF;

  v_effective := CASE WHEN v_status = 'grace' THEN 'patio' ELSE v_tier END;

  FOR r IN
    SELECT k.key, COALESCE(v.value, k.default_value) AS value
    FROM public.entitlement_keys k
    LEFT JOIN public.plan_entitlement_values v ON v.key = k.key AND v.tier = v_effective
  LOOP
    v_result := v_result || jsonb_build_object(r.key, r.value);
  END LOOP;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'effective_tier', v_effective,
    'subscription_status', v_status,
    'grace_ends_at', v_grace_ends,
    'trial_expires_at', v_trial_ends,
    'entitlements', v_result
  );
END $$;

CREATE OR REPLACE FUNCTION public.fn_init_provider_tenant(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tier text;
  v_trial timestamptz;
  v_has_catalog boolean;
  v_has_zone boolean;
  v_elig jsonb;
  v_eligible boolean;
  v_trial_days int;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN; END IF;

  SELECT trial_length_days INTO v_trial_days FROM public.subscription_config WHERE id = 1;
  v_trial_days := COALESCE(v_trial_days, 30);

  SELECT subscription_tier, trial_expires_at INTO v_tier, v_trial
  FROM public.tenants WHERE id = p_tenant_id;

  IF v_tier IS NULL OR v_tier IN ('trial','patio') THEN
    v_elig := public.fn_check_trial_eligibility(p_tenant_id);
    v_eligible := COALESCE((v_elig->>'eligible')::boolean, true);

    IF v_eligible THEN
      UPDATE public.tenants
        SET subscription_tier   = 'territory_trial',
            status              = 'trial',
            subscription_status = 'trial_active',
            grace_ends_at       = NULL,
            trial_expires_at    = COALESCE(trial_expires_at, now() + (v_trial_days || ' days')::interval),
            feature_flags       = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object('trial_granted_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
       WHERE id = p_tenant_id;
      PERFORM public.fn_record_trial_identities(p_tenant_id);

      PERFORM public.fn_log_subscription_transition(
        p_tenant_id, NULL, 'trial_active', v_tier, 'territory_trial',
        'trial_started', NULL, jsonb_build_object('trial_days', v_trial_days)
      );
    ELSE
      UPDATE public.tenants
        SET subscription_tier   = 'patio',
            status              = 'active',
            subscription_status = 'active',
            grace_ends_at       = NULL,
            trial_expires_at    = NULL,
            feature_flags       = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object('trial_denied_reason', v_elig)
       WHERE id = p_tenant_id;
    END IF;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.service_catalog WHERE tenant_id = p_tenant_id) INTO v_has_catalog;
  IF NOT v_has_catalog THEN
    INSERT INTO public.service_catalog (tenant_id, code, name, description, default_unit, default_price, is_active)
    SELECT p_tenant_id, g.code, g.name, g.description, g.default_unit, g.default_price, true
    FROM public.service_catalog g
    WHERE g.tenant_id IS NULL AND g.is_active = true;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.service_zones WHERE tenant_id = p_tenant_id) INTO v_has_zone;
  IF NOT v_has_zone THEN
    INSERT INTO public.service_zones (tenant_id, name, color) VALUES (p_tenant_id, 'Zonă implicită', '#10b981');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.fn_init_provider_tenant(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_init_provider_tenant(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.extend_trial_15(uuid);
