-- 1) Unique index excludes canceled invoices
DROP INDEX IF EXISTS public.invoices_contract_period_uidx;
CREATE UNIQUE INDEX invoices_contract_period_uidx
  ON public.invoices (contract_id, period_start)
  WHERE contract_id IS NOT NULL
    AND period_start IS NOT NULL
    AND source = 'CONTRACT_CYCLE'
    AND status <> 'CANCELED';

-- 2) next_invoice_date on contracts
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS next_invoice_date date;

-- Period bounds helper
CREATE OR REPLACE FUNCTION public.fn_contract_period_bounds(
  _contract_id uuid, _ref_date date,
  OUT period_start date, OUT period_end date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  yrs int;
  anchor date;
BEGIN
  SELECT * INTO c FROM public.contracts WHERE id = _contract_id;
  IF NOT FOUND OR c.is_one_time_project OR c.billing_cycle = 'ONE_TIME' THEN
    period_start := NULL; period_end := NULL; RETURN;
  END IF;

  IF c.billing_cycle = 'YEARLY' THEN
    anchor := COALESCE(c.start_date, _ref_date);
    yrs := GREATEST(FLOOR(EXTRACT(EPOCH FROM (_ref_date::timestamp - anchor::timestamp)) / 31557600)::int, 0);
    period_start := (anchor + (yrs || ' years')::interval)::date;
    IF period_start > _ref_date THEN
      period_start := (anchor + ((yrs - 1) || ' years')::interval)::date;
    END IF;
    period_end := (period_start + INTERVAL '1 year - 1 day')::date;
  ELSE
    period_start := date_trunc('month', _ref_date)::date;
    period_end := (date_trunc('month', _ref_date) + INTERVAL '1 month - 1 day')::date;
  END IF;
END;
$$;

-- 3) Single owner for cycle invoice creation
CREATE OR REPLACE FUNCTION public.fn_ensure_cycle_invoice(
  _contract_id uuid, _period_start date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c              record;
  v_tenant_id    uuid;
  v_customer_id  uuid;
  v_currency     text;
  v_ps           date;
  v_pe           date;
  v_invoice_id   uuid;
BEGIN
  SELECT ct.*, pr.customer_id AS cust_id, pr.tenant_id AS ten_id
    INTO c
    FROM public.contracts ct
    JOIN public.properties pr ON pr.id = ct.property_id
   WHERE ct.id = _contract_id;

  IF NOT FOUND OR c.is_one_time_project OR c.billing_cycle = 'ONE_TIME' THEN
    RETURN NULL;
  END IF;

  v_tenant_id   := COALESCE(c.tenant_id, c.ten_id);
  v_customer_id := c.cust_id;
  IF v_tenant_id IS NULL OR v_customer_id IS NULL THEN RETURN NULL; END IF;

  SELECT period_start, period_end
    INTO v_ps, v_pe
    FROM public.fn_contract_period_bounds(_contract_id, COALESCE(_period_start, CURRENT_DATE));
  IF v_ps IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_invoice_id
    FROM public.invoices
   WHERE contract_id = _contract_id
     AND source = 'CONTRACT_CYCLE'
     AND period_start = v_ps
     AND status <> 'CANCELED'
   LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    RETURN v_invoice_id;
  END IF;

  SELECT currency INTO v_currency FROM public.tenants WHERE id = v_tenant_id;

  INSERT INTO public.invoices (
    tenant_id, customer_id, contract_id, property_id,
    period_start, period_end, issue_date, due_date,
    currency, status, source, notes
  ) VALUES (
    v_tenant_id, v_customer_id, _contract_id, c.property_id,
    v_ps, v_pe, v_pe, v_pe + INTERVAL '14 days',
    COALESCE(v_currency, 'RON'), 'DRAFT', 'CONTRACT_CYCLE',
    'Ciclu de facturare generat automat.'
  )
  RETURNING id INTO v_invoice_id;

  -- Base contract scope lines (once per period)
  INSERT INTO public.invoice_line_items (
    invoice_id, tenant_id, contract_line_item_id,
    description, quantity, unit_price, line_group
  )
  SELECT v_invoice_id, v_tenant_id, cli.id,
         COALESCE(cli.custom_name, sc.name, 'Serviciu contract'),
         COALESCE(cli.quantity, 1),
         COALESCE(cli.unit_price, 0),
         'CONTRACT'
    FROM public.contract_line_items cli
    LEFT JOIN public.service_catalog sc ON sc.id = cli.service_catalog_id
   WHERE cli.contract_id = _contract_id;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_ensure_cycle_invoice(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_ensure_cycle_invoice(uuid, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_contract_period_bounds(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_contract_period_bounds(uuid, date) TO authenticated, service_role;

-- 4) Visit generator: append-only for recurring contracts
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_visit(_service_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit          record;
  v_customer_id    uuid;
  v_tenant_id      uuid;
  v_contract_id    uuid;
  v_currency       text;
  v_performed_date date;
  v_invoice_id     uuid;
BEGIN
  SELECT so.*, pr.customer_id AS cust_id, pr.tenant_id AS ten_id
    INTO v_visit
    FROM public.service_orders so
    JOIN public.properties pr ON pr.id = so.property_id
   WHERE so.id = _service_order_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_customer_id    := v_visit.cust_id;
  v_tenant_id      := COALESCE(v_visit.tenant_id, v_visit.ten_id);
  v_contract_id    := v_visit.contract_id;
  v_performed_date := COALESCE(v_visit.performed_date, v_visit.scheduled_date, CURRENT_DATE);

  IF v_customer_id IS NULL OR v_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- One-time projects are invoiced via fn_generate_invoice_for_project
  IF v_contract_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = v_contract_id
       AND (c.is_one_time_project OR c.billing_cycle = 'ONE_TIME')
  ) THEN
    RETURN NULL;
  END IF;

  IF v_contract_id IS NOT NULL THEN
    -- Recurring contract: append ad-hoc extras to the period's cycle invoice
    v_invoice_id := public.fn_ensure_cycle_invoice(v_contract_id, v_performed_date);
    IF v_invoice_id IS NULL THEN RETURN NULL; END IF;
  ELSE
    -- Standalone visit: its own ad-hoc invoice
    SELECT id INTO v_invoice_id
      FROM public.invoices
     WHERE service_order_id = _service_order_id
       AND status = 'DRAFT'
     LIMIT 1;

    IF v_invoice_id IS NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.service_order_items soi
         WHERE soi.service_order_id = _service_order_id
      ) THEN
        RETURN NULL;
      END IF;

      SELECT currency INTO v_currency FROM public.tenants WHERE id = v_tenant_id;

      INSERT INTO public.invoices (
        tenant_id, customer_id, property_id, service_order_id,
        period_start, period_end, issue_date, due_date,
        currency, status, source, notes
      ) VALUES (
        v_tenant_id, v_customer_id, v_visit.property_id, _service_order_id,
        v_performed_date, v_performed_date, v_performed_date,
        v_performed_date + INTERVAL '14 days',
        COALESCE(v_currency, 'RON'), 'DRAFT', 'ADHOC',
        'Draft generat automat la finalizarea vizitei.'
      )
      RETURNING id INTO v_invoice_id;
    END IF;
  END IF;

  INSERT INTO public.invoice_line_items (
    invoice_id, tenant_id, service_order_item_id, service_order_id,
    description, quantity, unit_price, line_group
  )
  SELECT v_invoice_id, v_tenant_id, soi.id, _service_order_id,
         COALESCE(soi.name, sc.name, 'Serviciu suplimentar'),
         COALESCE(soi.quantity, 1),
         COALESCE(soi.unit_price, 0),
         'ADHOC'
    FROM public.service_order_items soi
    LEFT JOIN public.service_catalog sc ON sc.id = soi.service_catalog_id
   WHERE soi.service_order_id = _service_order_id
     AND (soi.source = 'AD_HOC' OR v_contract_id IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_line_items ili
        WHERE ili.invoice_id = v_invoice_id
          AND ili.service_order_item_id = soi.id
     );

  -- Drop an empty standalone draft we just created
  IF v_contract_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_invoice_id
  ) THEN
    DELETE FROM public.invoices WHERE id = v_invoice_id;
    RETURN NULL;
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- 5) Visible failures
CREATE OR REPLACE FUNCTION public.trg_service_orders_invoice_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    BEGIN
      PERFORM public.fn_generate_invoice_for_visit(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.activity_log (
        property_id, tenant_id, event_type, event_description,
        related_entity_type, related_entity_id
      ) VALUES (
        NEW.property_id, NEW.tenant_id, 'invoice_generation_failed',
        'Generarea facturii a eșuat pentru vizită: ' || SQLERRM,
        'service_order', NEW.id
      );
    END;
  ELSIF OLD.status = 'COMPLETED' AND NEW.status IS DISTINCT FROM 'COMPLETED' THEN
    DELETE FROM public.invoices
     WHERE service_order_id = NEW.id
       AND status = 'DRAFT';
    DELETE FROM public.invoice_line_items
     WHERE service_order_id = NEW.id
       AND line_group = 'ADHOC'
       AND invoice_id IN (SELECT id FROM public.invoices WHERE status = 'DRAFT');
  END IF;
  RETURN NEW;
END;
$$;

-- 6) Daily cycle job
CREATE OR REPLACE FUNCTION public.fn_generate_due_cycle_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_count  integer := 0;
  v_ps     date;
  v_pe     date;
BEGIN
  FOR c IN
    SELECT id, billing_cycle, next_invoice_date, end_date
      FROM public.contracts
     WHERE status = 'ACTIVE'
       AND NOT is_one_time_project
       AND billing_cycle <> 'ONE_TIME'
       AND next_invoice_date IS NOT NULL
       AND next_invoice_date <= CURRENT_DATE
  LOOP
    BEGIN
      PERFORM public.fn_ensure_cycle_invoice(c.id, c.next_invoice_date);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'cycle invoice failed for contract %: %', c.id, SQLERRM;
    END;

    SELECT period_start, period_end INTO v_ps, v_pe
      FROM public.fn_contract_period_bounds(
        c.id,
        CASE WHEN c.billing_cycle = 'YEARLY'
             THEN (c.next_invoice_date + INTERVAL '1 day')::date
             ELSE (c.next_invoice_date + INTERVAL '1 day')::date
        END);

    UPDATE public.contracts
       SET next_invoice_date = v_pe
     WHERE id = c.id;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_generate_due_cycle_invoices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_due_cycle_invoices() TO service_role;

-- Keep next_invoice_date in sync
CREATE OR REPLACE FUNCTION public.trg_contracts_set_next_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ps date;
  v_pe date;
BEGIN
  IF NEW.is_one_time_project OR NEW.billing_cycle = 'ONE_TIME' THEN
    NEW.next_invoice_date := NULL;
    RETURN NEW;
  END IF;

  IF NEW.next_invoice_date IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle) THEN
    IF NEW.billing_cycle = 'YEARLY' THEN
      v_ps := COALESCE(NEW.start_date, CURRENT_DATE);
      WHILE (v_ps + INTERVAL '1 year - 1 day')::date < CURRENT_DATE LOOP
        v_ps := (v_ps + INTERVAL '1 year')::date;
      END LOOP;
      v_pe := (v_ps + INTERVAL '1 year - 1 day')::date;
    ELSE
      v_pe := (date_trunc('month', GREATEST(COALESCE(NEW.start_date, CURRENT_DATE), CURRENT_DATE))
               + INTERVAL '1 month - 1 day')::date;
    END IF;
    NEW.next_invoice_date := v_pe;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_set_next_invoice_date ON public.contracts;
CREATE TRIGGER contracts_set_next_invoice_date
  BEFORE INSERT OR UPDATE OF billing_cycle, start_date, is_one_time_project
  ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contracts_set_next_invoice_date();

-- Backfill existing recurring contracts
UPDATE public.contracts c
   SET next_invoice_date = CASE
     WHEN c.billing_cycle = 'YEARLY'
       THEN (SELECT period_end FROM public.fn_contract_period_bounds(c.id, CURRENT_DATE))
     ELSE (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
   END
 WHERE c.status = 'ACTIVE'
   AND NOT c.is_one_time_project
   AND c.billing_cycle <> 'ONE_TIME'
   AND c.next_invoice_date IS NULL;

-- 7) Ad-hoc items are always delivered
UPDATE public.service_order_items soi
   SET is_completed = true
  FROM public.service_orders so
 WHERE so.id = soi.service_order_id
   AND soi.source = 'AD_HOC'
   AND soi.is_completed = false
   AND so.status <> 'CANCELED';

-- 8) Daily cron
SELECT cron.unschedule('generate-cycle-invoices') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'generate-cycle-invoices'
);
SELECT cron.schedule(
  'generate-cycle-invoices',
  '30 2 * * *',
  $$ SELECT public.fn_generate_due_cycle_invoices(); $$
);