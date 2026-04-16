
-- =============================================
-- PHASE 1: Add tenant_id columns where missing
-- =============================================

-- contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- service_orders
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- service_order_items
ALTER TABLE public.service_order_items ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- contract_line_items
ALTER TABLE public.contract_line_items ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- offer_line_items
ALTER TABLE public.offer_line_items ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- feedback
ALTER TABLE public.feedback ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- activity_log
ALTER TABLE public.activity_log ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- inventory
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- inventory_items
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- =============================================
-- PHASE 1b: Backfill tenant_id from related tables
-- =============================================

-- Backfill properties.tenant_id from customers
UPDATE public.properties p
SET tenant_id = c.tenant_id
FROM public.customers c
WHERE p.customer_id = c.id AND p.tenant_id IS NULL AND c.tenant_id IS NOT NULL;

-- Backfill contracts.tenant_id from properties
UPDATE public.contracts ct
SET tenant_id = p.tenant_id
FROM public.properties p
WHERE ct.property_id = p.id AND ct.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Backfill service_orders.tenant_id from properties
UPDATE public.service_orders so
SET tenant_id = p.tenant_id
FROM public.properties p
WHERE so.property_id = p.id AND so.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Backfill contract_line_items.tenant_id from contracts
UPDATE public.contract_line_items cli
SET tenant_id = ct.tenant_id
FROM public.contracts ct
WHERE cli.contract_id = ct.id AND cli.tenant_id IS NULL AND ct.tenant_id IS NOT NULL;

-- Backfill offer_line_items.tenant_id from offers
UPDATE public.offer_line_items oli
SET tenant_id = o.tenant_id
FROM public.offers o
WHERE oli.offer_id = o.id AND oli.tenant_id IS NULL AND o.tenant_id IS NOT NULL;

-- Backfill service_order_items.tenant_id from service_orders
UPDATE public.service_order_items soi
SET tenant_id = so.tenant_id
FROM public.service_orders so
WHERE soi.service_order_id = so.id AND soi.tenant_id IS NULL AND so.tenant_id IS NOT NULL;

-- Backfill feedback.tenant_id from service_orders
UPDATE public.feedback f
SET tenant_id = so.tenant_id
FROM public.service_orders so
WHERE f.service_order_id = so.id AND f.tenant_id IS NULL AND so.tenant_id IS NOT NULL;

-- Backfill activity_log.tenant_id from properties
UPDATE public.activity_log al
SET tenant_id = p.tenant_id
FROM public.properties p
WHERE al.property_id = p.id AND al.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Backfill tasks.tenant_id from properties
UPDATE public.tasks t
SET tenant_id = p.tenant_id
FROM public.properties p
WHERE t.property_id = p.id AND t.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Backfill tasks.tenant_id from service_orders (for tasks without property_id)
UPDATE public.tasks t
SET tenant_id = so.tenant_id
FROM public.service_orders so
WHERE t.service_order_id = so.id AND t.tenant_id IS NULL AND so.tenant_id IS NOT NULL;

-- Backfill inventory.tenant_id from properties
UPDATE public.inventory inv
SET tenant_id = p.tenant_id
FROM public.properties p
WHERE inv.property_id = p.id AND inv.tenant_id IS NULL AND p.tenant_id IS NOT NULL;

-- Backfill inventory_items.tenant_id from inventory
UPDATE public.inventory_items ii
SET tenant_id = inv.tenant_id
FROM public.inventory inv
WHERE ii.inventory_id = inv.id AND ii.tenant_id IS NULL AND inv.tenant_id IS NOT NULL;

-- =============================================
-- PHASE 2: Drop and recreate provider RLS policies
-- =============================================

-- --- PROPERTIES ---
DROP POLICY IF EXISTS "Providers can manage all properties" ON public.properties;
CREATE POLICY "Providers can manage tenant properties"
ON public.properties FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- CONTRACTS ---
DROP POLICY IF EXISTS "Providers can manage all contracts" ON public.contracts;
CREATE POLICY "Providers can manage tenant contracts"
ON public.contracts FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- SERVICE_ORDERS ---
DROP POLICY IF EXISTS "Providers can manage all service orders" ON public.service_orders;
CREATE POLICY "Providers can manage tenant service orders"
ON public.service_orders FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- SERVICE_ORDER_ITEMS ---
DROP POLICY IF EXISTS "Providers can manage service order items" ON public.service_order_items;
CREATE POLICY "Providers can manage tenant service order items"
ON public.service_order_items FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- CONTRACT_LINE_ITEMS ---
DROP POLICY IF EXISTS "Providers can manage contract line items" ON public.contract_line_items;
CREATE POLICY "Providers can manage tenant contract line items"
ON public.contract_line_items FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- OFFER_LINE_ITEMS ---
DROP POLICY IF EXISTS "Providers can manage offer line items" ON public.offer_line_items;
CREATE POLICY "Providers can manage tenant offer line items"
ON public.offer_line_items FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- FEEDBACK ---
DROP POLICY IF EXISTS "Providers can view all feedback" ON public.feedback;
CREATE POLICY "Providers can view tenant feedback"
ON public.feedback FOR SELECT
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- ACTIVITY_LOG ---
DROP POLICY IF EXISTS "Providers can view all activity" ON public.activity_log;
CREATE POLICY "Providers can view tenant activity"
ON public.activity_log FOR SELECT
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Providers can create activity" ON public.activity_log;
CREATE POLICY "Providers can create tenant activity"
ON public.activity_log FOR INSERT
WITH CHECK (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- TASKS ---
DROP POLICY IF EXISTS "Providers can manage all tasks" ON public.tasks;
CREATE POLICY "Providers can manage tenant tasks"
ON public.tasks FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- INVENTORY ---
DROP POLICY IF EXISTS "Providers can manage all inventory" ON public.inventory;
CREATE POLICY "Providers can manage tenant inventory"
ON public.inventory FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- INVENTORY_ITEMS ---
DROP POLICY IF EXISTS "Providers can manage all inventory items" ON public.inventory_items;
CREATE POLICY "Providers can manage tenant inventory items"
ON public.inventory_items FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- CUSTOMERS: tighten existing policy ---
DROP POLICY IF EXISTS "Providers can manage tenant customers" ON public.customers;
CREATE POLICY "Providers can manage tenant customers"
ON public.customers FOR ALL
USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

-- --- USER_ROLES: restrict view to same-tenant ---
DROP POLICY IF EXISTS "Providers can view all roles" ON public.user_roles;
CREATE POLICY "Providers can view tenant roles"
ON public.user_roles FOR SELECT
USING (
  is_provider(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id
    AND p.tenant_id = get_user_tenant_id(auth.uid())
  )
);
