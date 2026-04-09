
-- Global bank holidays
CREATE TABLE public.global_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  name text NOT NULL,
  country_code text NOT NULL DEFAULT 'RO',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(date, country_code)
);

ALTER TABLE public.global_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view holidays"
  ON public.global_holidays FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage holidays"
  ON public.global_holidays FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Tenant-specific non-workdays
CREATE TABLE public.tenant_non_workdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  date date NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(tenant_id, date)
);

ALTER TABLE public.tenant_non_workdays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view tenant non-workdays"
  ON public.tenant_non_workdays FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Provider admins can manage tenant non-workdays"
  ON public.tenant_non_workdays FOR ALL
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'PROVIDER_ADMIN'))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'PROVIDER_ADMIN'));

-- Helper function: is a given date a workday for a tenant?
CREATE OR REPLACE FUNCTION public.is_workday(_tenant_id uuid, _date date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    EXTRACT(DOW FROM _date) != 0  -- not Sunday
    AND NOT EXISTS (SELECT 1 FROM public.global_holidays WHERE date = _date)
    AND NOT EXISTS (SELECT 1 FROM public.tenant_non_workdays WHERE tenant_id = _tenant_id AND date = _date)
$$;

-- Seed Romanian bank holidays for 2025 & 2026
INSERT INTO public.global_holidays (date, name, country_code) VALUES
  -- 2025
  ('2025-01-01', 'New Year''s Day', 'RO'),
  ('2025-01-02', 'Day after New Year', 'RO'),
  ('2025-01-06', 'Epiphany', 'RO'),
  ('2025-01-07', 'Synaxis of St. John', 'RO'),
  ('2025-01-24', 'Unification Day', 'RO'),
  ('2025-04-18', 'Orthodox Good Friday', 'RO'),
  ('2025-04-20', 'Orthodox Easter Sunday', 'RO'),
  ('2025-04-21', 'Orthodox Easter Monday', 'RO'),
  ('2025-05-01', 'Labour Day', 'RO'),
  ('2025-06-01', 'Children''s Day', 'RO'),
  ('2025-06-08', 'Orthodox Pentecost', 'RO'),
  ('2025-06-09', 'Orthodox Whit Monday', 'RO'),
  ('2025-08-15', 'Assumption of Mary', 'RO'),
  ('2025-11-30', 'St. Andrew''s Day', 'RO'),
  ('2025-12-01', 'National Day', 'RO'),
  ('2025-12-25', 'Christmas Day', 'RO'),
  ('2025-12-26', 'Second Day of Christmas', 'RO'),
  -- 2026
  ('2026-01-01', 'New Year''s Day', 'RO'),
  ('2026-01-02', 'Day after New Year', 'RO'),
  ('2026-01-06', 'Epiphany', 'RO'),
  ('2026-01-07', 'Synaxis of St. John', 'RO'),
  ('2026-01-24', 'Unification Day', 'RO'),
  ('2026-04-10', 'Orthodox Good Friday', 'RO'),
  ('2026-04-12', 'Orthodox Easter Sunday', 'RO'),
  ('2026-04-13', 'Orthodox Easter Monday', 'RO'),
  ('2026-05-01', 'Labour Day', 'RO'),
  ('2026-05-31', 'Orthodox Pentecost', 'RO'),
  ('2026-06-01', 'Children''s Day / Whit Monday', 'RO'),
  ('2026-08-15', 'Assumption of Mary', 'RO'),
  ('2026-11-30', 'St. Andrew''s Day', 'RO'),
  ('2026-12-01', 'National Day', 'RO'),
  ('2026-12-25', 'Christmas Day', 'RO'),
  ('2026-12-26', 'Second Day of Christmas', 'RO');
