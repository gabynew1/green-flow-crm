-- 1) Add PER_CONTRACT to frequency_type enum
ALTER TYPE public.frequency_type ADD VALUE IF NOT EXISTS 'PER_CONTRACT';

-- 2) Backfill: default customers.contact_person_name from name where missing
UPDATE public.customers
SET contact_person_name = name
WHERE contact_person_name IS NULL AND name IS NOT NULL;

-- 3) Seed 3 missing irrigation services under Regular Maintenance (idempotent by code+name)
INSERT INTO public.service_catalog (code, name, default_unit, default_price, is_active)
SELECT * FROM (VALUES
  ('Regular Maintenance', 'Irrigation system winterization and drainage', 'job', 100, true),
  ('Regular Maintenance', 'Irrigation system spring startup', 'job', 100, true),
  ('Regular Maintenance', 'Irrigation system operation check', 'job', 60, true)
) AS v(code, name, default_unit, default_price, is_active)
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_catalog sc
  WHERE sc.code = v.code AND sc.name = v.name AND sc.tenant_id IS NULL
);

-- 4) Add RO/EN translations for the 3 new services (idempotent)
WITH new_svcs AS (
  SELECT id, name FROM public.service_catalog
  WHERE tenant_id IS NULL AND code = 'Regular Maintenance' AND name IN (
    'Irrigation system winterization and drainage',
    'Irrigation system spring startup',
    'Irrigation system operation check'
  )
),
tr AS (
  SELECT * FROM (VALUES
    ('Irrigation system winterization and drainage', 'ro', 'Golire instalație de irigare și pregătire pentru iarnă'),
    ('Irrigation system winterization and drainage', 'en', 'Irrigation system winterization and drainage'),
    ('Irrigation system spring startup',            'ro', 'Punere în funcțiune instalație de irigare după iarnă'),
    ('Irrigation system spring startup',            'en', 'Irrigation system spring startup'),
    ('Irrigation system operation check',           'ro', 'Verificare funcționare instalație irigare'),
    ('Irrigation system operation check',           'en', 'Irrigation system operation check')
  ) AS x(en_name, locale, label)
)
INSERT INTO public.service_catalog_translations (service_id, locale, name)
SELECT ns.id, tr.locale, tr.label
FROM new_svcs ns
JOIN tr ON tr.en_name = ns.name
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_catalog_translations t
  WHERE t.service_id = ns.id AND t.locale = tr.locale
);