
-- Phase 1: Delete orphaned data (children first)
DELETE FROM public.inventory_items WHERE tenant_id IS NULL;
DELETE FROM public.inventory WHERE tenant_id IS NULL;
DELETE FROM public.service_order_items WHERE tenant_id IS NULL;
DELETE FROM public.service_orders WHERE tenant_id IS NULL;
DELETE FROM public.contract_line_items WHERE tenant_id IS NULL;
DELETE FROM public.contracts WHERE tenant_id IS NULL;
DELETE FROM public.properties WHERE tenant_id IS NULL;
DELETE FROM public.customers WHERE tenant_id IS NULL;
DELETE FROM public.activity_log WHERE tenant_id IS NULL;
DELETE FROM public.tasks WHERE tenant_id IS NULL;
DELETE FROM public.feedback WHERE tenant_id IS NULL;

-- Phase 2: Add NOT NULL constraints
ALTER TABLE public.customers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.properties ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.contracts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.service_orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.service_order_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.contract_line_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.inventory ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN tenant_id SET NOT NULL;

-- Phase 3: Fix handle_new_property trigger to propagate tenant_id
CREATE OR REPLACE FUNCTION public.handle_new_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.inventory (property_id, tenant_id)
  VALUES (NEW.id, NEW.tenant_id);
  RETURN NEW;
END;
$$;
