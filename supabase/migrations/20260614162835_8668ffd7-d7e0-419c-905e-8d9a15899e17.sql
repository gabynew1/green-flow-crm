
-- 1. Add locale to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS locale text;
COMMENT ON COLUMN public.profiles.locale IS 'User preferred UI language code (e.g. ro, en). NULL means not yet chosen.';

-- 2. Service catalog translations
CREATE TABLE IF NOT EXISTS public.service_catalog_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.service_catalog(id) ON DELETE CASCADE,
  locale text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id, locale)
);

GRANT SELECT ON public.service_catalog_translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_catalog_translations TO authenticated;
GRANT ALL ON public.service_catalog_translations TO service_role;

ALTER TABLE public.service_catalog_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read service translations"
  ON public.service_catalog_translations FOR SELECT
  USING (true);

CREATE POLICY "SuperAdmins can manage service translations"
  ON public.service_catalog_translations FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 3. Inventory category translations
CREATE TABLE IF NOT EXISTS public.inventory_category_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code text NOT NULL,
  locale text NOT NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_code, locale)
);

GRANT SELECT ON public.inventory_category_translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.inventory_category_translations TO authenticated;
GRANT ALL ON public.inventory_category_translations TO service_role;

ALTER TABLE public.inventory_category_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read inventory category translations"
  ON public.inventory_category_translations FOR SELECT
  USING (true);

CREATE POLICY "SuperAdmins can manage inventory category translations"
  ON public.inventory_category_translations FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 4. updated_at triggers
CREATE TRIGGER set_updated_at_service_catalog_translations
  BEFORE UPDATE ON public.service_catalog_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_updated_at_inventory_category_translations
  BEFORE UPDATE ON public.inventory_category_translations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Seed inventory category translations (RO + EN)
INSERT INTO public.inventory_category_translations (category_code, locale, label, description) VALUES
  ('TREE',       'en', 'Tree',         'Trees on the property'),
  ('TREE',       'ro', 'Copac',        'Copaci de pe proprietate'),
  ('LAWN',       'en', 'Lawn',         'Lawn areas'),
  ('LAWN',       'ro', 'Gazon',        'Suprafețe de gazon'),
  ('SHRUB',      'en', 'Shrub',        'Shrubs and bushes'),
  ('SHRUB',      'ro', 'Arbust',       'Arbuști și tufișuri'),
  ('FLOWER_BED', 'en', 'Flower bed',   'Flower beds'),
  ('FLOWER_BED', 'ro', 'Strat de flori','Straturi de flori'),
  ('HEDGE',      'en', 'Hedge',        'Hedges'),
  ('HEDGE',      'ro', 'Gard viu',     'Garduri vii'),
  ('IRRIGATION', 'en', 'Irrigation',   'Irrigation system'),
  ('IRRIGATION', 'ro', 'Irigații',     'Sistem de irigații'),
  ('PAVING',     'en', 'Paving',       'Paved surfaces'),
  ('PAVING',     'ro', 'Pavaj',        'Suprafețe pavate'),
  ('PLANTER',    'en', 'Planter',      'Planters and pots'),
  ('PLANTER',    'ro', 'Jardinieră',   'Jardiniere și ghivece'),
  ('LIGHTING',   'en', 'Lighting',     'Outdoor lighting'),
  ('LIGHTING',   'ro', 'Iluminat',     'Iluminat exterior'),
  ('FENCE',      'en', 'Fence',        'Fencing'),
  ('FENCE',      'ro', 'Gard',         'Împrejmuiri'),
  ('OTHER',      'en', 'Other',        'Other items'),
  ('OTHER',      'ro', 'Altele',       'Alte elemente')
ON CONFLICT (category_code, locale) DO NOTHING;

-- 6. Seed service catalog translations from existing rows (RO + EN start as English copy of name; admin can refine)
INSERT INTO public.service_catalog_translations (service_id, locale, name, description)
SELECT id, 'en', name, description FROM public.service_catalog
ON CONFLICT (service_id, locale) DO NOTHING;

-- For RO, seed with the existing name as placeholder (will be refined by admins/migrations)
INSERT INTO public.service_catalog_translations (service_id, locale, name, description)
SELECT id, 'ro', name, description FROM public.service_catalog
ON CONFLICT (service_id, locale) DO NOTHING;
