
-- 1. plan_entitlements (one row per tier)
CREATE TABLE public.plan_entitlements (
  tier text PRIMARY KEY,
  display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  price_monthly_eur numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_entitlements TO authenticated, anon;
GRANT ALL ON public.plan_entitlements TO service_role;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_entitlements_read_all" ON public.plan_entitlements FOR SELECT USING (true);
CREATE POLICY "plan_entitlements_service" ON public.plan_entitlements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. entitlement_keys (catalog of capabilities)
CREATE TABLE public.entitlement_keys (
  key text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('limits','features','integrations','support')),
  value_type text NOT NULL CHECK (value_type IN ('int','bool','enum')),
  enum_values text[],
  unlimited_sentinel int,
  description text,
  default_value jsonb NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entitlement_keys TO authenticated, anon;
GRANT ALL ON public.entitlement_keys TO service_role;
ALTER TABLE public.entitlement_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entitlement_keys_read_all" ON public.entitlement_keys FOR SELECT USING (true);
CREATE POLICY "entitlement_keys_service" ON public.entitlement_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. plan_entitlement_values (tier × key)
CREATE TABLE public.plan_entitlement_values (
  tier text NOT NULL REFERENCES public.plan_entitlements(tier) ON DELETE CASCADE,
  key  text NOT NULL REFERENCES public.entitlement_keys(key) ON DELETE CASCADE,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (tier, key)
);
GRANT SELECT ON public.plan_entitlement_values TO authenticated, anon;
GRANT ALL ON public.plan_entitlement_values TO service_role;
ALTER TABLE public.plan_entitlement_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_entitlement_values_read_all" ON public.plan_entitlement_values FOR SELECT USING (true);
CREATE POLICY "plan_entitlement_values_service" ON public.plan_entitlement_values FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_plan_entitlements_touch BEFORE UPDATE ON public.plan_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_entitlement_keys_touch BEFORE UPDATE ON public.entitlement_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_plan_entitlement_values_touch BEFORE UPDATE ON public.plan_entitlement_values
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed tiers
INSERT INTO public.plan_entitlements (tier, display_name, sort_order, price_monthly_eur, notes) VALUES
  ('patio','Patio',1,0,'Free forever'),
  ('backyard','Backyard',2,5,'For growing crews'),
  ('estate','Estate',3,30,'For established service businesses'),
  ('territory','Territory',4,100,'For multi-region operators'),
  ('territory_trial','Territory Trial',0,NULL,'30-day full-access trial — auto-downgrades to Patio');

-- Seed entitlement keys
INSERT INTO public.entitlement_keys (key, label, category, value_type, enum_values, unlimited_sentinel, description, default_value, sort_order) VALUES
  ('max_teams','Max teams','limits','int',NULL,999,'Maximum number of field teams','0'::jsonb,10),
  ('max_provider_seats','Provider user seats','limits','int',NULL,999,'Maximum provider-side user accounts','1'::jsonb,20),
  ('max_active_clients','Max active clients','limits','int',NULL,999,'Maximum active client customer records','10'::jsonb,30),
  ('max_properties','Max managed properties','limits','int',NULL,999,'Maximum properties under management','25'::jsonb,40),
  ('max_active_contracts','Max active contracts','limits','int',NULL,999,'Maximum simultaneously active contracts','10'::jsonb,50),
  ('ai_tier','AI tier','features','enum',ARRAY['none','standard','advanced','full'],NULL,'AI assistant capability level','"none"'::jsonb,100),
  ('agentic_actions','Agentic AI actions','features','bool',NULL,NULL,'AI may take actions on behalf of the user','false'::jsonb,110),
  ('custom_email_templates','Custom email templates','features','bool',NULL,NULL,'Tenant-customised transactional emails','false'::jsonb,120),
  ('branded_client_links','Branded client links','features','bool',NULL,NULL,'White-labelled client portal links','false'::jsonb,130),
  ('service_zones','Service zones','features','bool',NULL,NULL,'Geographic clustering for scheduling','true'::jsonb,140),
  ('einvoice_efactura','RO e-Factura integration','integrations','bool',NULL,NULL,'Romanian RO_CIUS/e-Factura submission','false'::jsonb,200),
  ('telegram_agent','Telegram agent','integrations','bool',NULL,NULL,'Telegram-driven AI agent for field staff','false'::jsonb,210),
  ('google_calendar','Google Calendar sync','integrations','bool',NULL,NULL,'Two-way Google Calendar sync','false'::jsonb,220),
  ('priority_support','Priority support','support','bool',NULL,NULL,'Priority email/chat support SLA','false'::jsonb,300),
  ('dedicated_success_manager','Dedicated success manager','support','bool',NULL,NULL,'Named CSM','false'::jsonb,310);

-- Seed values per tier (territory_trial mirrors territory)
DO $$
DECLARE
  matrix jsonb := '[
    ["max_teams",                  0,    2,    5,    999,  999],
    ["max_provider_seats",         1,    4,    10,   999,  999],
    ["max_active_clients",         10,   50,   250,  999,  999],
    ["max_properties",             25,   150,  750,  999,  999],
    ["max_active_contracts",       10,   100,  500,  999,  999]
  ]'::jsonb;
  bool_matrix jsonb := '[
    ["agentic_actions",            false, false, true,  true,  true],
    ["custom_email_templates",     false, false, true,  true,  true],
    ["branded_client_links",       false, false, true,  true,  true],
    ["service_zones",              true,  true,  true,  true,  true],
    ["einvoice_efactura",          false, false, true,  true,  true],
    ["telegram_agent",             false, false, false, true,  true],
    ["google_calendar",            false, true,  true,  true,  true],
    ["priority_support",           false, false, true,  true,  true],
    ["dedicated_success_manager",  false, false, false, true,  true]
  ]'::jsonb;
  ai_matrix jsonb := '["none","standard","advanced","full","full"]'::jsonb;
  tiers text[] := ARRAY['patio','backyard','estate','territory','territory_trial'];
  row_j jsonb;
  k text;
  i int;
BEGIN
  FOR row_j IN SELECT jsonb_array_elements(matrix) LOOP
    k := row_j->>0;
    FOR i IN 1..5 LOOP
      INSERT INTO public.plan_entitlement_values (tier, key, value)
      VALUES (tiers[i], k, (row_j->i))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  FOR row_j IN SELECT jsonb_array_elements(bool_matrix) LOOP
    k := row_j->>0;
    FOR i IN 1..5 LOOP
      INSERT INTO public.plan_entitlement_values (tier, key, value)
      VALUES (tiers[i], k, (row_j->i))
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
  FOR i IN 1..5 LOOP
    INSERT INTO public.plan_entitlement_values (tier, key, value)
    VALUES (tiers[i], 'ai_tier', (ai_matrix->(i-1)))
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Resolver: returns merged entitlement map for a tenant
CREATE OR REPLACE FUNCTION public.fn_get_tenant_entitlements(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_result jsonb := '{}'::jsonb;
  r record;
BEGIN
  SELECT subscription_tier INTO v_tier FROM public.tenants WHERE id = p_tenant_id;
  IF v_tier IS NULL THEN v_tier := 'patio'; END IF;

  FOR r IN
    SELECT k.key, COALESCE(v.value, k.default_value) AS value
    FROM public.entitlement_keys k
    LEFT JOIN public.plan_entitlement_values v ON v.key = k.key AND v.tier = v_tier
  LOOP
    v_result := v_result || jsonb_build_object(r.key, r.value);
  END LOOP;

  RETURN jsonb_build_object('tier', v_tier, 'entitlements', v_result);
END;
$$;
GRANT EXECUTE ON FUNCTION public.fn_get_tenant_entitlements(uuid) TO authenticated, service_role;

-- Admin write RPC (audited, super-admin only)
CREATE OR REPLACE FUNCTION public.fn_set_entitlement(p_tier text, p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_old jsonb;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT value INTO v_old FROM public.plan_entitlement_values WHERE tier = p_tier AND key = p_key;

  INSERT INTO public.plan_entitlement_values (tier, key, value, updated_by)
  VALUES (p_tier, p_key, p_value, auth.uid())
  ON CONFLICT (tier, key) DO UPDATE
    SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();

  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'entitlement_change', 'plan_entitlement', NULL,
    jsonb_build_object('tier', p_tier, 'key', p_key, 'old', v_old, 'new', p_value));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_set_entitlement(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_entitlement(text,text,jsonb) TO authenticated, service_role;

-- Add new entitlement key admin RPC (also seeds default value for every tier)
CREATE OR REPLACE FUNCTION public.fn_add_entitlement_key(
  p_key text, p_label text, p_category text, p_value_type text,
  p_default_value jsonb, p_description text DEFAULT NULL,
  p_enum_values text[] DEFAULT NULL, p_unlimited_sentinel int DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()) INTO v_is_admin;
  IF NOT v_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.entitlement_keys (key, label, category, value_type, enum_values, unlimited_sentinel, description, default_value)
  VALUES (p_key, p_label, p_category, p_value_type, p_enum_values, p_unlimited_sentinel, p_description, p_default_value);

  INSERT INTO public.plan_entitlement_values (tier, key, value, updated_by)
  SELECT t.tier, p_key, p_default_value, auth.uid() FROM public.plan_entitlements t;

  INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'entitlement_key_added', 'entitlement_key', NULL,
    jsonb_build_object('key', p_key, 'category', p_category, 'default', p_default_value));
END;
$$;
REVOKE ALL ON FUNCTION public.fn_add_entitlement_key(text,text,text,text,jsonb,text,text[],int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_add_entitlement_key(text,text,text,text,jsonb,text,text[],int) TO authenticated, service_role;
