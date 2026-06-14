-- service_zones table
CREATE TABLE public.service_zones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#10b981'
               CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_zones TO authenticated;
GRANT ALL ON public.service_zones TO service_role;

ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zones_select_same_tenant_providers"
  ON public.service_zones FOR SELECT
  USING (public.is_provider(auth.uid())
     AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "zones_insert_admin"
  ON public.service_zones FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
          AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "zones_update_admin"
  ON public.service_zones FOR UPDATE
  USING  (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
      AND tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
          AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "zones_delete_admin"
  ON public.service_zones FOR DELETE
  USING (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
     AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE TRIGGER trg_service_zones_updated_at
  BEFORE UPDATE ON public.service_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Soft link from properties; deleting a zone nulls the FK on its properties
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS zone_id UUID
    REFERENCES public.service_zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_tenant_zone
  ON public.properties(tenant_id, zone_id);