-- 1) Contracts: clients may only accept/reject, and only from SENT_TO_CLIENT
DROP POLICY IF EXISTS "Clients can update contract status" ON public.contracts;
CREATE POLICY "Clients can update contract status"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  property_id IN (SELECT p.id FROM public.properties p WHERE p.customer_id = public.get_user_customer_id(auth.uid()))
)
WITH CHECK (
  property_id IN (SELECT p.id FROM public.properties p WHERE p.customer_id = public.get_user_customer_id(auth.uid()))
  AND status IN ('SIGNED'::contract_status, 'REJECTED'::contract_status)
);

CREATE OR REPLACE FUNCTION public.guard_client_contract_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guards direct client-side (authenticated role) updates.
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.is_provider(auth.uid()) THEN RETURN NEW; END IF;

  IF OLD.status <> 'SENT_TO_CLIENT'::contract_status THEN
    RAISE EXCEPTION 'Contract is not awaiting your signature';
  END IF;
  IF NEW.status NOT IN ('SIGNED'::contract_status, 'REJECTED'::contract_status) THEN
    RAISE EXCEPTION 'Clients may only sign or reject a contract';
  END IF;

  -- Freeze every other column
  NEW.id := OLD.id;
  NEW.property_id := OLD.property_id;
  NEW.tenant_id := OLD.tenant_id;
  NEW.contract_name := OLD.contract_name;
  NEW.start_date := OLD.start_date;
  NEW.end_date := OLD.end_date;
  NEW.billing_cycle := OLD.billing_cycle;
  NEW.visit_frequency_count := OLD.visit_frequency_count;
  NEW.visit_frequency_type := OLD.visit_frequency_type;
  NEW.offer_id := OLD.offer_id;
  NEW.archived := OLD.archived;
  NEW.is_one_time_project := OLD.is_one_time_project;
  NEW.next_invoice_date := OLD.next_invoice_date;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_client_contract_update ON public.contracts;
CREATE TRIGGER trg_guard_client_contract_update
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.guard_client_contract_update();

-- 2) Service orders: clients may only flip status / needs_client_action
CREATE OR REPLACE FUNCTION public.guard_client_service_order_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF public.is_provider(auth.uid()) THEN RETURN NEW; END IF;

  NEW.id := OLD.id;
  NEW.property_id := OLD.property_id;
  NEW.contract_id := OLD.contract_id;
  NEW.tenant_id := OLD.tenant_id;
  NEW.team_id := OLD.team_id;
  NEW.scheduled_date := OLD.scheduled_date;
  NEW.scheduled_start_time := OLD.scheduled_start_time;
  NEW.scheduled_end_time := OLD.scheduled_end_time;
  NEW.performed_date := OLD.performed_date;
  NEW.period_type := OLD.period_type;
  NEW.period_label := OLD.period_label;
  NEW.notes := OLD.notes;
  NEW.client_summary := OLD.client_summary;
  NEW.cancel_reason := OLD.cancel_reason;
  NEW.checked_in_at := OLD.checked_in_at;
  NEW.created_by_user_id := OLD.created_by_user_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_client_service_order_update ON public.service_orders;
CREATE TRIGGER trg_guard_client_service_order_update
BEFORE UPDATE ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_client_service_order_update();

-- 3) Customers: a client's self-created customer row cannot claim a tenant
DROP POLICY IF EXISTS "Clients can insert their own customer" ON public.customers;
CREATE POLICY "Clients can insert their own customer"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.customer_id IS NOT NULL
  )
);

-- 4) Properties: block direct tenant reassignment by clients
DROP POLICY IF EXISTS "Clients can update property tenant_id" ON public.properties;

CREATE OR REPLACE FUNCTION public.guard_property_tenant_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Property tenant assignment can only change through the link/delink flow';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_property_tenant_reassignment ON public.properties;
CREATE TRIGGER trg_guard_property_tenant_reassignment
BEFORE UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.guard_property_tenant_reassignment();