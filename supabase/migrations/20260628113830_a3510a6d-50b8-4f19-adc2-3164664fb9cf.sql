
-- 1. trial_consumed_identities
CREATE TABLE public.trial_consumed_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_kind text NOT NULL CHECK (fingerprint_kind IN ('email','cui','vat','company_name','phone')),
  fingerprint_hash text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (fingerprint_kind, fingerprint_hash)
);
GRANT SELECT ON public.trial_consumed_identities TO authenticated;
GRANT ALL ON public.trial_consumed_identities TO service_role;
ALTER TABLE public.trial_consumed_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trial_identities_super_admin_read" ON public.trial_consumed_identities
  FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));
CREATE POLICY "trial_identities_service" ON public.trial_consumed_identities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_trial_identities_hash ON public.trial_consumed_identities (fingerprint_kind, fingerprint_hash);
CREATE INDEX idx_trial_identities_tenant ON public.trial_consumed_identities (tenant_id);

-- 2. Helpers: normalise + hash
CREATE OR REPLACE FUNCTION public.fn_trial_normalise(p_kind text, p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  v := lower(trim(p_value));
  IF v = '' THEN RETURN NULL; END IF;
  IF p_kind = 'phone' THEN
    v := regexp_replace(v, '[^0-9]', '', 'g');
    IF length(v) < 6 THEN RETURN NULL; END IF;
  ELSIF p_kind = 'company_name' THEN
    v := regexp_replace(v, '\s+', ' ', 'g');
    v := regexp_replace(v, '[^a-z0-9 ]', '', 'g');
    v := trim(v);
    IF length(v) < 2 THEN RETURN NULL; END IF;
  ELSIF p_kind = 'cui' OR p_kind = 'vat' THEN
    v := regexp_replace(v, '[^a-z0-9]', '', 'g');
    IF length(v) < 4 THEN RETURN NULL; END IF;
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.fn_trial_hash(p_kind text, p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  v := public.fn_trial_normalise(p_kind, p_value);
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN encode(digest('gg-trial:' || p_kind || ':' || v, 'sha256'), 'hex');
END $$;

-- 3. Check if any identity for a tenant has already consumed a trial
CREATE OR REPLACE FUNCTION public.fn_check_trial_eligibility(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text; v_cui text; v_vat text; v_name text; v_phone text;
  v_hashes text[] := ARRAY[]::text[];
  v_kinds text[] := ARRAY[]::text[];
  v_match record;
  v_h text;
BEGIN
  SELECT t.name INTO v_name FROM public.tenants t WHERE t.id = p_tenant_id;
  SELECT p.email, p.cui, p.vat_id, p.phone
    INTO v_email, v_cui, v_vat, v_phone
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.tenant_id = p_tenant_id AND ur.role::text = 'PROVIDER_ADMIN'
  ORDER BY p.created_at ASC
  LIMIT 1;

  v_h := public.fn_trial_hash('email', v_email);        IF v_h IS NOT NULL THEN v_hashes := array_append(v_hashes,v_h); v_kinds := array_append(v_kinds,'email');        END IF;
  v_h := public.fn_trial_hash('cui', v_cui);            IF v_h IS NOT NULL THEN v_hashes := array_append(v_hashes,v_h); v_kinds := array_append(v_kinds,'cui');          END IF;
  v_h := public.fn_trial_hash('vat', v_vat);            IF v_h IS NOT NULL THEN v_hashes := array_append(v_hashes,v_h); v_kinds := array_append(v_kinds,'vat');          END IF;
  v_h := public.fn_trial_hash('company_name', v_name);  IF v_h IS NOT NULL THEN v_hashes := array_append(v_hashes,v_h); v_kinds := array_append(v_kinds,'company_name'); END IF;
  v_h := public.fn_trial_hash('phone', v_phone);        IF v_h IS NOT NULL THEN v_hashes := array_append(v_hashes,v_h); v_kinds := array_append(v_kinds,'phone');        END IF;

  IF array_length(v_hashes,1) IS NULL THEN
    RETURN jsonb_build_object('eligible', true, 'reason', 'no_fingerprint');
  END IF;

  SELECT * INTO v_match
  FROM public.trial_consumed_identities tci
  WHERE (tci.fingerprint_kind, tci.fingerprint_hash) IN (
    SELECT unnest(v_kinds), unnest(v_hashes)
  )
  AND (tci.tenant_id IS NULL OR tci.tenant_id <> p_tenant_id)
  LIMIT 1;

  IF v_match.id IS NOT NULL THEN
    RETURN jsonb_build_object('eligible', false, 'matched_kind', v_match.fingerprint_kind, 'matched_tenant', v_match.tenant_id);
  END IF;

  RETURN jsonb_build_object('eligible', true);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_check_trial_eligibility(uuid) TO service_role;

-- 4. Record identities for a tenant (idempotent)
CREATE OR REPLACE FUNCTION public.fn_record_trial_identities(p_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text; v_cui text; v_vat text; v_name text; v_phone text;
  v_count int := 0;
BEGIN
  SELECT t.name INTO v_name FROM public.tenants t WHERE t.id = p_tenant_id;
  SELECT p.email, p.cui, p.vat_id, p.phone
    INTO v_email, v_cui, v_vat, v_phone
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.tenant_id = p_tenant_id AND ur.role::text = 'PROVIDER_ADMIN'
  ORDER BY p.created_at ASC LIMIT 1;

  INSERT INTO public.trial_consumed_identities (fingerprint_kind, fingerprint_hash, tenant_id)
  SELECT k, public.fn_trial_hash(k, v) AS h, p_tenant_id
  FROM (VALUES
    ('email', v_email),('cui', v_cui),('vat', v_vat),('company_name', v_name),('phone', v_phone)
  ) AS s(k,v)
  WHERE public.fn_trial_hash(k,v) IS NOT NULL
  ON CONFLICT (fingerprint_kind, fingerprint_hash) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_record_trial_identities(uuid) TO service_role;

-- 5. Rewrite fn_init_provider_tenant: 30-day trial + eligibility check
CREATE OR REPLACE FUNCTION public.fn_init_provider_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_trial timestamptz;
  v_has_catalog boolean;
  v_has_zone boolean;
  v_elig jsonb;
  v_eligible boolean;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN; END IF;

  SELECT subscription_tier, trial_expires_at
    INTO v_tier, v_trial
  FROM public.tenants WHERE id = p_tenant_id;

  -- Only initialise tier/trial for brand-new tenants (still on default 'trial' status or unset tier)
  IF v_tier IS NULL OR v_tier IN ('trial','patio') THEN
    v_elig := public.fn_check_trial_eligibility(p_tenant_id);
    v_eligible := COALESCE((v_elig->>'eligible')::boolean, true);

    IF v_eligible THEN
      UPDATE public.tenants
        SET subscription_tier = 'territory_trial',
            status = 'trial',
            trial_expires_at = COALESCE(trial_expires_at, now() + interval '30 days'),
            feature_flags = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object('trial_granted_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
       WHERE id = p_tenant_id;
      PERFORM public.fn_record_trial_identities(p_tenant_id);
    ELSE
      UPDATE public.tenants
        SET subscription_tier = 'patio',
            status = 'active',
            trial_expires_at = NULL,
            feature_flags = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object('trial_denied_reason', v_elig)
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

-- 6. fn_expire_trials: soft-lock to Patio when trial elapsed
CREATE OR REPLACE FUNCTION public.fn_expire_trials()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, subscription_tier, trial_expires_at, feature_flags
    FROM public.tenants
    WHERE subscription_tier = 'territory_trial'
      AND trial_expires_at IS NOT NULL
      AND trial_expires_at <= now()
  LOOP
    UPDATE public.tenants
       SET subscription_tier = 'patio',
           feature_flags = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object(
             'trial_grace', jsonb_build_object(
               'downgraded_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'prev_tier', 'territory_trial'
             )
           )
     WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_expire_trials() TO service_role;

-- 7. Super admin extra-trial override
CREATE OR REPLACE FUNCTION public.fn_grant_extra_trial(p_tenant_id uuid, p_days int DEFAULT 30, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.tenants
     SET subscription_tier = 'territory_trial',
         status = 'trial',
         trial_expires_at = now() + (p_days || ' days')::interval,
         feature_flags = COALESCE(feature_flags,'{}'::jsonb) || jsonb_build_object(
           'extra_trial_granted_at', to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'extra_trial_reason', COALESCE(p_reason,'')
         )
   WHERE id = p_tenant_id;

  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'grant_extra_trial', 'tenant', p_tenant_id,
    jsonb_build_object('days', p_days, 'reason', p_reason));
END $$;
REVOKE ALL ON FUNCTION public.fn_grant_extra_trial(uuid,int,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_grant_extra_trial(uuid,int,text) TO authenticated, service_role;
