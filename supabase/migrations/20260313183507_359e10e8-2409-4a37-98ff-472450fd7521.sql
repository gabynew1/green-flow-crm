
-- ===== 1. NEW ENUMS =====
CREATE TYPE public.inspection_status AS ENUM ('DRAFT', 'COMPLETED', 'OFFER_GENERATED');
CREATE TYPE public.offer_status AS ENUM ('DRAFT', 'IN_PROGRESS', 'SENT_TO_CLIENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELED');

-- ===== 2. UPDATE contract_status ENUM =====
CREATE TYPE public.contract_status_new AS ENUM ('DRAFT', 'SENT_TO_CLIENT', 'SIGNED', 'ACTIVE', 'CLOSED');

ALTER TABLE public.contracts
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.contract_status_new USING (
    CASE status::text
      WHEN 'PENDING_NEW' THEN 'SENT_TO_CLIENT'
      WHEN 'PAUSED' THEN 'ACTIVE'
      WHEN 'TERMINATED' THEN 'CLOSED'
      WHEN 'REJECTED' THEN 'CLOSED'
      ELSE status::text
    END
  )::public.contract_status_new,
  ALTER COLUMN status SET DEFAULT 'DRAFT'::public.contract_status_new;

DROP TYPE public.contract_status;
ALTER TYPE public.contract_status_new RENAME TO contract_status;

-- ===== 3. UPDATE service_order_status ENUM =====
-- First drop the RLS policy that references the old enum
DROP POLICY IF EXISTS "Clients can update service order status" ON public.service_orders;

CREATE TYPE public.service_order_status_new AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'PENDING_APPROVAL', 'APPROVED', 'SENT_TO_CLIENT', 'CANCELED');

ALTER TABLE public.service_orders
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.service_order_status_new USING (
    CASE status::text
      WHEN 'DRAFT' THEN 'SCHEDULED'
      WHEN 'CLIENT_APPROVED' THEN 'APPROVED'
      WHEN 'CLIENT_REJECTED' THEN 'CANCELED'
      ELSE status::text
    END
  )::public.service_order_status_new,
  ALTER COLUMN status SET DEFAULT 'SCHEDULED'::public.service_order_status_new;

DROP TYPE public.service_order_status;
ALTER TYPE public.service_order_status_new RENAME TO service_order_status;

-- Recreate the RLS policy with new enum value
CREATE POLICY "Clients can update service order status" ON public.service_orders
  FOR UPDATE USING (
    property_id IN (SELECT id FROM public.properties WHERE customer_id = get_user_customer_id(auth.uid()))
    AND status = 'SENT_TO_CLIENT'::public.service_order_status
  );

-- ===== 4. NEW TABLES =====

-- Inspections
CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  status public.inspection_status NOT NULL DEFAULT 'DRAFT',
  title text NOT NULL,
  notes text,
  findings text,
  inspected_date date,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can manage inspections" ON public.inspections
  FOR ALL USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Clients can view their inspections" ON public.inspections
  FOR SELECT USING (customer_id = get_user_customer_id(auth.uid()));

CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Offers
CREATE TABLE public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid REFERENCES public.inspections(id),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  status public.offer_status NOT NULL DEFAULT 'DRAFT',
  offer_name text NOT NULL,
  notes text,
  rejection_comment text,
  valid_until date,
  total_value numeric,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can manage offers" ON public.offers
  FOR ALL USING (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Clients can view their offers" ON public.offers
  FOR SELECT USING (customer_id = get_user_customer_id(auth.uid()));

CREATE POLICY "Clients can update offer status" ON public.offers
  FOR UPDATE USING (customer_id = get_user_customer_id(auth.uid()) AND status = 'SENT_TO_CLIENT'::public.offer_status)
  WITH CHECK (customer_id = get_user_customer_id(auth.uid()));

CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Offer Line Items
CREATE TABLE public.offer_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  service_catalog_id uuid REFERENCES public.service_catalog(id),
  custom_name text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric,
  unit text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offer_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can manage offer line items" ON public.offer_line_items
  FOR ALL USING (is_provider(auth.uid()));

CREATE POLICY "Clients can view their offer line items" ON public.offer_line_items
  FOR SELECT USING (
    offer_id IN (
      SELECT id FROM public.offers WHERE customer_id = get_user_customer_id(auth.uid())
    )
  );

CREATE TRIGGER update_offer_line_items_updated_at BEFORE UPDATE ON public.offer_line_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===== 5. ADD offer_id TO contracts =====
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS offer_id uuid REFERENCES public.offers(id);
