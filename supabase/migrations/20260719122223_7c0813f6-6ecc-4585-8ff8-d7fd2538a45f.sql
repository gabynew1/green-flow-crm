
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('DRAFT','ISSUED','PAID','OVERDUE','CANCELED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_source AS ENUM ('CONTRACT_CYCLE','ADHOC','MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('CASH','TRANSFER','CARD','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  contract_id uuid,
  property_id uuid,
  invoice_number text,
  period_start date,
  period_end date,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RON',
  status public.invoice_status NOT NULL DEFAULT 'DRAFT',
  source public.invoice_source NOT NULL DEFAULT 'MANUAL',
  paid_at timestamptz,
  notes text,
  created_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX invoices_tenant_number_uidx ON public.invoices(tenant_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX invoices_contract_period_uidx ON public.invoices(contract_id, period_start) WHERE contract_id IS NOT NULL AND period_start IS NOT NULL AND source = 'CONTRACT_CYCLE';
CREATE INDEX invoices_tenant_status_idx ON public.invoices(tenant_id, status);
CREATE INDEX invoices_customer_idx ON public.invoices(customer_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider tenant read invoices" ON public.invoices FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Provider tenant write invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Provider tenant update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Provider tenant delete draft invoices" ON public.invoices FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND status = 'DRAFT');
CREATE POLICY "Client read own issued invoices" ON public.invoices FOR SELECT TO authenticated
  USING (
    status <> 'DRAFT'
    AND customer_id IN (SELECT customer_id FROM public.profiles WHERE user_id = auth.uid() AND customer_id IS NOT NULL)
  );

-- ============ INVOICE LINE ITEMS ============
CREATE TABLE public.invoice_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  contract_line_item_id uuid,
  service_order_id uuid,
  service_order_item_id uuid,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoice_line_items_invoice_idx ON public.invoice_line_items(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider tenant manage invoice lines" ON public.invoice_line_items FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Client read own invoice lines" ON public.invoice_line_items FOR SELECT TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE status <> 'DRAFT'
      AND customer_id IN (SELECT customer_id FROM public.profiles WHERE user_id = auth.uid() AND customer_id IS NOT NULL)
    )
  );

-- ============ INVOICE PAYMENTS ============
CREATE TABLE public.invoice_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  method public.payment_method NOT NULL DEFAULT 'TRANSFER',
  reference text,
  notes text,
  recorded_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoice_payments_invoice_idx ON public.invoice_payments(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider tenant manage payments" ON public.invoice_payments FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Client read own payments" ON public.invoice_payments FOR SELECT TO authenticated
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices
      WHERE customer_id IN (SELECT customer_id FROM public.profiles WHERE user_id = auth.uid() AND customer_id IS NOT NULL)
    )
  );

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.touch_invoice_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER invoices_touch BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_invoice_updated_at();

-- Auto invoice number on issue
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  seq_num int;
  yr text;
BEGIN
  IF NEW.invoice_number IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'DRAFT' THEN RETURN NEW; END IF;
  yr := to_char(COALESCE(NEW.issue_date, CURRENT_DATE), 'YYYY');
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '^INV-\d{4}-', ''), '')::int), 0) + 1
    INTO seq_num
    FROM public.invoices
    WHERE tenant_id = NEW.tenant_id
      AND invoice_number LIKE 'INV-' || yr || '-%';
  NEW.invoice_number := 'INV-' || yr || '-' || lpad(seq_num::text, 5, '0');
  RETURN NEW;
END; $$;

CREATE TRIGGER invoices_assign_number BEFORE INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- Recompute invoice totals & status from payments
CREATE OR REPLACE FUNCTION public.fn_recompute_invoice_status(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  paid_sum numeric;
  inv record;
BEGIN
  SELECT * INTO inv FROM public.invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM(amount),0) INTO paid_sum FROM public.invoice_payments WHERE invoice_id = _invoice_id;
  IF inv.status = 'CANCELED' THEN RETURN; END IF;
  IF paid_sum >= inv.total AND inv.total > 0 THEN
    UPDATE public.invoices
       SET status = 'PAID', paid_at = COALESCE(paid_at, now())
     WHERE id = _invoice_id;
  ELSIF inv.status = 'PAID' AND paid_sum < inv.total THEN
    UPDATE public.invoices SET status = 'ISSUED', paid_at = NULL WHERE id = _invoice_id;
  ELSIF inv.status IN ('ISSUED','OVERDUE') AND inv.due_date < CURRENT_DATE AND paid_sum < inv.total THEN
    UPDATE public.invoices SET status = 'OVERDUE' WHERE id = _invoice_id AND status <> 'OVERDUE';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_payments_recompute()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.fn_recompute_invoice_status(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END; $$;

CREATE TRIGGER invoice_payments_recompute AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payments_recompute();

-- Recompute invoice total from lines
CREATE OR REPLACE FUNCTION public.trg_lines_recompute_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  inv_id uuid;
  new_subtotal numeric;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(line_total),0) INTO new_subtotal FROM public.invoice_line_items WHERE invoice_id = inv_id;
  UPDATE public.invoices SET subtotal = new_subtotal, total = new_subtotal WHERE id = inv_id;
  RETURN NULL;
END; $$;

CREATE TRIGGER invoice_lines_recompute AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_lines_recompute_totals();

-- Auto line_total
CREATE OR REPLACE FUNCTION public.trg_line_compute()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.line_total := ROUND(COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_price,0), 2);
  RETURN NEW;
END; $$;

CREATE TRIGGER invoice_line_compute BEFORE INSERT OR UPDATE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_line_compute();

-- ============ GENERATE INVOICE FOR CONTRACT CYCLE ============
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_contract_cycle(_contract_id uuid, _period_start date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  p_currency text;
  cust_id uuid;
  period_end_d date;
  new_invoice_id uuid;
  existing_id uuid;
BEGIN
  SELECT co.*, pr.customer_id AS cust_id, pr.id AS prop_id
    INTO c
    FROM public.contracts co
    JOIN public.properties pr ON pr.id = co.property_id
    WHERE co.id = _contract_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract % not found', _contract_id; END IF;

  SELECT id INTO existing_id FROM public.invoices
    WHERE contract_id = _contract_id AND period_start = _period_start AND source = 'CONTRACT_CYCLE'
    LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  SELECT currency INTO p_currency FROM public.tenants WHERE id = c.tenant_id;

  period_end_d := CASE WHEN c.billing_cycle = 'YEARLY'
                       THEN (_period_start + INTERVAL '1 year' - INTERVAL '1 day')::date
                       ELSE (_period_start + INTERVAL '1 month' - INTERVAL '1 day')::date END;

  INSERT INTO public.invoices (tenant_id, customer_id, contract_id, property_id, period_start, period_end,
                                issue_date, due_date, currency, status, source)
  VALUES (c.tenant_id, c.cust_id, _contract_id, c.prop_id, _period_start, period_end_d,
          _period_start, _period_start + INTERVAL '14 days', COALESCE(p_currency,'RON'), 'DRAFT', 'CONTRACT_CYCLE')
  RETURNING id INTO new_invoice_id;

  -- Insert lines from contract line items (skip zero-price items are OK)
  INSERT INTO public.invoice_line_items (invoice_id, tenant_id, contract_line_item_id, description, quantity, unit_price)
  SELECT new_invoice_id, c.tenant_id, cli.id,
         COALESCE(cli.custom_name, sc.name, 'Serviciu'),
         COALESCE(cli.quantity, 1),
         COALESCE(cli.unit_price, 0)
    FROM public.contract_line_items cli
    LEFT JOIN public.service_catalog sc ON sc.id = cli.service_catalog_id
    WHERE cli.contract_id = _contract_id;

  RETURN new_invoice_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_for_contract_cycle(uuid, date) TO authenticated;

-- ============ CLIENT UPCOMING CHARGES VIEW ============
CREATE OR REPLACE VIEW public.v_client_upcoming_charges AS
SELECT
  i.id AS invoice_id,
  i.customer_id,
  i.tenant_id,
  i.contract_id,
  i.invoice_number,
  i.total,
  i.currency,
  i.due_date,
  i.status,
  'INVOICE'::text AS kind
FROM public.invoices i
WHERE i.status IN ('ISSUED','OVERDUE');

GRANT SELECT ON public.v_client_upcoming_charges TO authenticated;
