
-- =========================================================================
-- A2: Add needs_client_action flag and collapse deprecated visit statuses
-- =========================================================================
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS needs_client_action boolean NOT NULL DEFAULT false;

-- Backfill: any row currently on one of the 3 deprecated approval statuses
-- becomes SCHEDULED with the flag turned on.
UPDATE public.service_orders
SET status = 'SCHEDULED',
    needs_client_action = true,
    updated_at = now()
WHERE status IN ('PENDING_APPROVAL', 'APPROVED', 'SENT_TO_CLIENT');

-- Replace the client-update policy so it keys off the flag, not the enum
DROP POLICY IF EXISTS "Clients can update service order status" ON public.service_orders;
CREATE POLICY "Clients can update service order status"
  ON public.service_orders
  FOR UPDATE
  USING (
    property_id IN (
      SELECT properties.id FROM public.properties
      WHERE properties.customer_id = public.get_user_customer_id(auth.uid())
    )
    AND needs_client_action = true
  )
  WITH CHECK (
    property_id IN (
      SELECT properties.id FROM public.properties
      WHERE properties.customer_id = public.get_user_customer_id(auth.uid())
    )
  );

-- =========================================================================
-- B2: visit_requests inbox (client submits, provider triages)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.visit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_date date,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'declined')),
  converted_service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL,
  provider_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_requests TO authenticated;
GRANT ALL ON public.visit_requests TO service_role;

ALTER TABLE public.visit_requests ENABLE ROW LEVEL SECURITY;

-- Clients: insert & view their own requests
CREATE POLICY "Clients create own visit requests"
  ON public.visit_requests
  FOR INSERT
  WITH CHECK (
    requested_by_user_id = auth.uid()
    AND property_id IN (
      SELECT id FROM public.properties
      WHERE customer_id = public.get_user_customer_id(auth.uid())
    )
  );

CREATE POLICY "Clients view own visit requests"
  ON public.visit_requests
  FOR SELECT
  USING (
    requested_by_user_id = auth.uid()
    OR property_id IN (
      SELECT id FROM public.properties
      WHERE customer_id = public.get_user_customer_id(auth.uid())
    )
  );

-- Providers: full access within their tenant
CREATE POLICY "Providers manage tenant visit requests"
  ON public.visit_requests
  FOR ALL
  USING (
    public.is_provider(auth.uid())
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
  WITH CHECK (
    public.is_provider(auth.uid())
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  );

CREATE INDEX IF NOT EXISTS visit_requests_tenant_status_idx
  ON public.visit_requests (tenant_id, status, created_at DESC);

-- Auto-populate tenant_id + customer_id from property when a client inserts
CREATE OR REPLACE FUNCTION public.visit_requests_autofill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.customer_id IS NULL THEN
    SELECT p.tenant_id, p.customer_id
    INTO NEW.tenant_id, NEW.customer_id
    FROM public.properties p
    WHERE p.id = NEW.property_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visit_requests_autofill ON public.visit_requests;
CREATE TRIGGER trg_visit_requests_autofill
  BEFORE INSERT ON public.visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.visit_requests_autofill();

-- Reuse the existing touch_updated_at trigger pattern
DROP TRIGGER IF EXISTS trg_visit_requests_updated_at ON public.visit_requests;
CREATE TRIGGER trg_visit_requests_updated_at
  BEFORE UPDATE ON public.visit_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
