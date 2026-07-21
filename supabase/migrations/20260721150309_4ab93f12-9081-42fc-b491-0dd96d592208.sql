
-- 1. Private reference tables
CREATE TABLE IF NOT EXISTS public.service_catalog_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  default_unit text,
  default_price numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_defaults_code_name_uidx
  ON public.service_catalog_defaults (lower(code), lower(name));
GRANT SELECT ON public.service_catalog_defaults TO authenticated;
GRANT ALL ON public.service_catalog_defaults TO service_role;
ALTER TABLE public.service_catalog_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read catalog defaults" ON public.service_catalog_defaults;
CREATE POLICY "Authenticated can read catalog defaults"
  ON public.service_catalog_defaults FOR SELECT TO authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Super admins manage catalog defaults" ON public.service_catalog_defaults;
CREATE POLICY "Super admins manage catalog defaults"
  ON public.service_catalog_defaults FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.service_catalog_default_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_id uuid NOT NULL REFERENCES public.service_catalog_defaults(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (default_id, locale)
);
GRANT SELECT ON public.service_catalog_default_translations TO authenticated;
GRANT ALL ON public.service_catalog_default_translations TO service_role;
ALTER TABLE public.service_catalog_default_translations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read default translations" ON public.service_catalog_default_translations;
CREATE POLICY "Authenticated can read default translations"
  ON public.service_catalog_default_translations FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Super admins manage default translations" ON public.service_catalog_default_translations;
CREATE POLICY "Super admins manage default translations"
  ON public.service_catalog_default_translations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. Snapshot NULL-tenant rows into defaults
INSERT INTO public.service_catalog_defaults (code, name, description, default_unit, default_price, is_active)
SELECT DISTINCT ON (lower(code), lower(name))
  code, name, description, default_unit, default_price, true
FROM public.service_catalog WHERE tenant_id IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.service_catalog_default_translations (default_id, locale, name, description)
SELECT DISTINCT ON (d.id, t.locale) d.id, t.locale, t.name, t.description
FROM public.service_catalog_translations t
JOIN public.service_catalog s ON s.id = t.service_id
JOIN public.service_catalog_defaults d
  ON lower(d.code) = lower(s.code) AND lower(d.name) = lower(s.name)
WHERE s.tenant_id IS NULL
ON CONFLICT DO NOTHING;

-- 3. Backfill missing per-tenant catalog + translations
WITH tenant_list AS (SELECT id AS tenant_id FROM public.tenants),
missing AS (
  INSERT INTO public.service_catalog (tenant_id, code, name, description, default_unit, default_price, is_active)
  SELECT tl.tenant_id, d.code, d.name, d.description, d.default_unit, d.default_price, true
  FROM tenant_list tl CROSS JOIN public.service_catalog_defaults d
  WHERE d.is_active AND NOT EXISTS (
    SELECT 1 FROM public.service_catalog s
    WHERE s.tenant_id = tl.tenant_id
      AND lower(s.code) = lower(d.code) AND lower(s.name) = lower(d.name)
  )
  RETURNING id, tenant_id, code, name
)
INSERT INTO public.service_catalog_translations (service_id, locale, name, description)
SELECT m.id, dt.locale, dt.name, dt.description
FROM missing m
JOIN public.service_catalog_defaults d
  ON lower(d.code) = lower(m.code) AND lower(d.name) = lower(m.name)
JOIN public.service_catalog_default_translations dt ON dt.default_id = d.id
ON CONFLICT (service_id, locale) DO NOTHING;

-- 4. Remap existing line-item FKs from NULL-tenant rows to tenant-scoped rows
UPDATE public.contract_line_items cli
SET service_catalog_id = ts.id
FROM public.service_catalog s_old, public.service_catalog ts
WHERE cli.service_catalog_id = s_old.id
  AND s_old.tenant_id IS NULL
  AND ts.tenant_id = cli.tenant_id
  AND lower(ts.code) = lower(s_old.code)
  AND lower(ts.name) = lower(s_old.name);

UPDATE public.offer_line_items oli
SET service_catalog_id = ts.id
FROM public.service_catalog s_old, public.service_catalog ts
WHERE oli.service_catalog_id = s_old.id
  AND s_old.tenant_id IS NULL
  AND ts.tenant_id = oli.tenant_id
  AND lower(ts.code) = lower(s_old.code)
  AND lower(ts.name) = lower(s_old.name);

UPDATE public.service_order_items soi
SET service_catalog_id = ts.id
FROM public.service_catalog s_old, public.service_catalog ts
WHERE soi.service_catalog_id = s_old.id
  AND s_old.tenant_id IS NULL
  AND ts.tenant_id = soi.tenant_id
  AND lower(ts.code) = lower(s_old.code)
  AND lower(ts.name) = lower(s_old.name);

-- 5. Remove legacy shared globals (translations cascade)
DELETE FROM public.service_catalog WHERE tenant_id IS NULL;

-- 6. Enforce NOT NULL tenant_id
ALTER TABLE public.service_catalog ALTER COLUMN tenant_id SET NOT NULL;

-- 7. Tighten SELECT policies
DROP POLICY IF EXISTS "Authenticated users can view own tenant or global services" ON public.service_catalog;
DROP POLICY IF EXISTS "Providers view own tenant catalog" ON public.service_catalog;
CREATE POLICY "Providers view own tenant catalog"
  ON public.service_catalog FOR SELECT TO authenticated
  USING (is_active = true AND tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read service translations" ON public.service_catalog_translations;
DROP POLICY IF EXISTS "Providers view own tenant service translations" ON public.service_catalog_translations;
CREATE POLICY "Providers view own tenant service translations"
  ON public.service_catalog_translations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.service_catalog s
    WHERE s.id = service_catalog_translations.service_id
      AND s.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

-- 8. Rewrite import RPC to read from private defaults
CREATE OR REPLACE FUNCTION public.import_default_service_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
  v_imported int := 0;
  v_total int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_provider(auth.uid()) THEN RAISE EXCEPTION 'Only providers can import the default catalog'; END IF;
  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No tenant assigned to current user'; END IF;

  SELECT count(*) INTO v_total FROM public.service_catalog_defaults WHERE is_active;

  WITH inserted AS (
    INSERT INTO public.service_catalog (tenant_id, code, name, description, default_unit, default_price, is_active)
    SELECT v_tenant, d.code, d.name, d.description, d.default_unit, d.default_price, true
    FROM public.service_catalog_defaults d
    WHERE d.is_active AND NOT EXISTS (
      SELECT 1 FROM public.service_catalog t
      WHERE t.tenant_id = v_tenant
        AND lower(t.code) = lower(d.code) AND lower(t.name) = lower(d.name)
    )
    RETURNING id, code, name
  ),
  trans AS (
    INSERT INTO public.service_catalog_translations (service_id, locale, name, description)
    SELECT i.id, dt.locale, dt.name, dt.description
    FROM inserted i
    JOIN public.service_catalog_defaults d
      ON lower(d.code) = lower(i.code) AND lower(d.name) = lower(i.name)
    JOIN public.service_catalog_default_translations dt ON dt.default_id = d.id
    ON CONFLICT (service_id, locale) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_imported FROM inserted;

  RETURN jsonb_build_object('imported', v_imported, 'skipped', v_total - v_imported, 'total', v_total);
END;
$function$;
