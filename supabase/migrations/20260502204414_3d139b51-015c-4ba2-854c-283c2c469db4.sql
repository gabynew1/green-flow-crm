-- ============================================================
-- Pillar 1: Tenant & User Email Governance
-- ============================================================

-- 1. Reference table: email categories
CREATE TABLE public.email_categories (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO public.email_categories (key, display_name, description, is_required, sort_order) VALUES
  ('account',          'Account & Security',     'Password resets, account changes, security alerts. Required.', true,  1),
  ('visits',           'Visit reports & reminders', 'Notifications about scheduled and completed visits.',         false, 2),
  ('contracts_offers', 'Contracts & Offers',     'Contract and offer notifications, signatures, responses.',       false, 3),
  ('inspections',      'Inspections',            'Inspection scheduling, reports, and follow-ups.',                false, 4);

ALTER TABLE public.email_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view email categories"
  ON public.email_categories FOR SELECT
  TO authenticated
  USING (true);

-- 2. Per-tenant email settings
CREATE TABLE public.tenant_email_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  from_name TEXT,
  reply_to TEXT,
  footer_html TEXT,
  logo_url TEXT,
  brand_color TEXT DEFAULT '#10b981',
  locale TEXT NOT NULL DEFAULT 'ro' CHECK (locale IN ('en','ro')),
  -- per-category enable toggles (account is always on, but stored for symmetry)
  cat_account_enabled BOOLEAN NOT NULL DEFAULT true,
  cat_visits_enabled BOOLEAN NOT NULL DEFAULT true,
  cat_contracts_offers_enabled BOOLEAN NOT NULL DEFAULT true,
  cat_inspections_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_email_settings ENABLE ROW LEVEL SECURITY;

-- Super admins: full access
CREATE POLICY "Super admins manage all tenant email settings"
  ON public.tenant_email_settings FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- Provider full-admins: manage own tenant
-- Uses the existing has_tenant_role function pattern; falls back to profiles join
CREATE POLICY "Tenant admins view own email settings"
  ON public.tenant_email_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id = tenant_email_settings.tenant_id
        AND p.provider_permission = 'full_admin'
    )
  );

CREATE POLICY "Tenant admins update own email settings"
  ON public.tenant_email_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id = tenant_email_settings.tenant_id
        AND p.provider_permission = 'full_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id = tenant_email_settings.tenant_id
        AND p.provider_permission = 'full_admin'
    )
  );

-- Service role full access (for the send pipeline)
CREATE POLICY "Service role manages tenant email settings"
  ON public.tenant_email_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. Per-recipient (email) preferences
CREATE TABLE public.user_email_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  cat_account_enabled BOOLEAN NOT NULL DEFAULT true,    -- ignored at send time, always required
  cat_visits_enabled BOOLEAN NOT NULL DEFAULT true,
  cat_contracts_offers_enabled BOOLEAN NOT NULL DEFAULT true,
  cat_inspections_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_email_preferences_email ON public.user_email_preferences (lower(email));

ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

-- Super admins: full access
CREATE POLICY "Super admins manage all email preferences"
  ON public.user_email_preferences FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- Users manage their own (matched via profiles.email or auth user email)
CREATE POLICY "Users view own email preferences"
  ON public.user_email_preferences FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower((SELECT auth.jwt() ->> 'email'))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND lower(p.email) = lower(user_email_preferences.email)
    )
  );

CREATE POLICY "Users update own email preferences"
  ON public.user_email_preferences FOR UPDATE
  TO authenticated
  USING (
    lower(email) = lower((SELECT auth.jwt() ->> 'email'))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND lower(p.email) = lower(user_email_preferences.email)
    )
  )
  WITH CHECK (
    lower(email) = lower((SELECT auth.jwt() ->> 'email'))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND lower(p.email) = lower(user_email_preferences.email)
    )
  );

CREATE POLICY "Users insert own email preferences"
  ON public.user_email_preferences FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(email) = lower((SELECT auth.jwt() ->> 'email'))
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND lower(p.email) = lower(user_email_preferences.email)
    )
  );

-- Service role full access
CREATE POLICY "Service role manages email preferences"
  ON public.user_email_preferences FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4. Augment email_send_log with tenant + category
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_email_send_log_tenant ON public.email_send_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_category ON public.email_send_log (category);

-- Super admins can read the send log (for future ops UI)
CREATE POLICY "Super admins read send log"
  ON public.email_send_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid()));

-- Tenant admins read their own tenant's log
CREATE POLICY "Tenant admins read own tenant send log"
  ON public.email_send_log FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.tenant_id = email_send_log.tenant_id
        AND p.provider_permission = 'full_admin'
    )
  );

-- 5. Updated-at triggers
CREATE TRIGGER update_tenant_email_settings_updated_at
  BEFORE UPDATE ON public.tenant_email_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_email_preferences_updated_at
  BEFORE UPDATE ON public.user_email_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Seed defaults for every existing tenant
INSERT INTO public.tenant_email_settings (tenant_id)
SELECT id FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- 7. Auto-create settings row when a new tenant is created
CREATE OR REPLACE FUNCTION public.create_tenant_email_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tenant_email_settings (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_tenant_email_settings
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_tenant_email_settings();

-- 8. Helper: resolve effective send permission for (email, category, tenant)
-- Returns true if the email should be sent.
-- Required categories always pass user prefs but still respect tenant kill switch.
CREATE OR REPLACE FUNCTION public.email_send_allowed(
  _email TEXT,
  _category TEXT,
  _tenant_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_required BOOLEAN;
  _tenant_enabled BOOLEAN := true;
  _user_enabled BOOLEAN := true;
BEGIN
  -- Unknown categories: allow (fail-open for legacy templates)
  SELECT is_required INTO _is_required FROM public.email_categories WHERE key = _category;
  IF _is_required IS NULL THEN
    RETURN true;
  END IF;

  -- Tenant kill switch (skipped if no tenant context)
  IF _tenant_id IS NOT NULL THEN
    SELECT
      CASE _category
        WHEN 'account'          THEN cat_account_enabled
        WHEN 'visits'           THEN cat_visits_enabled
        WHEN 'contracts_offers' THEN cat_contracts_offers_enabled
        WHEN 'inspections'      THEN cat_inspections_enabled
        ELSE true
      END
    INTO _tenant_enabled
    FROM public.tenant_email_settings
    WHERE tenant_id = _tenant_id;

    IF _tenant_enabled IS NULL THEN _tenant_enabled := true; END IF;

    -- Tenant kill switch applies even to required categories
    IF _tenant_enabled = false THEN RETURN false; END IF;
  END IF;

  -- Required categories bypass user preferences
  IF _is_required THEN RETURN true; END IF;

  -- User preference
  SELECT
    CASE _category
      WHEN 'visits'           THEN cat_visits_enabled
      WHEN 'contracts_offers' THEN cat_contracts_offers_enabled
      WHEN 'inspections'      THEN cat_inspections_enabled
      ELSE true
    END
  INTO _user_enabled
  FROM public.user_email_preferences
  WHERE lower(email) = lower(_email);

  -- No prefs row = default opted-in
  IF _user_enabled IS NULL THEN RETURN true; END IF;

  RETURN _user_enabled;
END;
$$;

GRANT EXECUTE ON FUNCTION public.email_send_allowed(TEXT, TEXT, UUID) TO service_role, authenticated;