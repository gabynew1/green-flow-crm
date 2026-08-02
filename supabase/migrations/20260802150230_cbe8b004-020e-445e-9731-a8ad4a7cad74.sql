CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_visit(_service_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_visit          record;
  v_customer_id    uuid;
  v_property_id    uuid;
  v_tenant_id      uuid;
  v_contract_id    uuid;
  v_currency       text;
  v_performed_date date;
  v_period_start   date;
  v_period_end     date;
  v_existing_id    uuid;
  v_new_invoice_id uuid;
  v_reused         boolean := false;
  v_lines_added    integer := 0;
BEGIN
  SELECT so.*, pr.customer_id AS cust_id, pr.tenant_id AS tenant_id
    INTO v_visit
    FROM public.service_orders so
    JOIN public.properties pr ON pr.id = so.property_id
   WHERE so.id = _service_order_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_customer_id := v_visit.cust_id;
  v_property_id := v_visit.property_id;
  v_tenant_id   := v_visit.tenant_id;
  v_contract_id := v_visit.contract_id;
  v_performed_date := COALESCE(v_visit.performed_date, v_visit.scheduled_date, CURRENT_DATE);

  IF v_customer_id IS NULL OR v_tenant_id IS NULL THEN RETURN NULL; END IF;

  IF v_contract_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c WHERE c.id = v_contract_id AND c.is_one_time_project
  ) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing_id
    FROM public.invoices
   WHERE service_order_id = _service_order_id AND status = 'DRAFT'
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.invoice_line_items WHERE invoice_id = v_existing_id;
    v_new_invoice_id := v_existing_id;
    v_reused := true;
  ELSE
    -- Reuse an open draft for the same contract period instead of violating
    -- invoices_contract_period_uidx (two visits completed in the same period).
    IF v_contract_id IS NOT NULL THEN
      SELECT id INTO v_new_invoice_id
        FROM public.invoices
       WHERE contract_id = v_contract_id
         AND source = 'CONTRACT_CYCLE'
         AND status = 'DRAFT'
         AND period_start = v_performed_date
       LIMIT 1;
    END IF;

    IF v_new_invoice_id IS NOT NULL THEN
      v_reused := true;
    ELSE
      SELECT currency INTO v_currency FROM public.tenants WHERE id = v_tenant_id;

      INSERT INTO public.invoices (
        tenant_id, customer_id, contract_id, property_id, service_order_id,
        period_start, period_end, issue_date, due_date, currency, status, source, notes
      ) VALUES (
        v_tenant_id, v_customer_id, v_contract_id, v_property_id, _service_order_id,
        v_performed_date, v_performed_date,
        v_performed_date, v_performed_date + INTERVAL '14 days',
        COALESCE(v_currency, 'RON'),
        'DRAFT',
        CASE WHEN v_contract_id IS NOT NULL THEN 'CONTRACT_CYCLE'::invoice_source ELSE 'ADHOC'::invoice_source END,
        'Draft generat automat la finalizarea vizitei.'
      )
      RETURNING id INTO v_new_invoice_id;
    END IF;
  END IF;

  IF v_contract_id IS NOT NULL THEN
    FOR v_visit IN
      SELECT cli.id, cli.custom_name, cli.quantity, cli.unit_price,
             cli.frequency_type, cli.service_catalog_id,
             sc.name AS catalog_name
        FROM public.contract_line_items cli
        LEFT JOIN public.service_catalog sc ON sc.id = cli.service_catalog_id
       WHERE cli.contract_id = v_contract_id
    LOOP
      IF v_visit.frequency_type = 'PER_MONTH' THEN
        v_period_start := date_trunc('month', v_performed_date)::date;
        v_period_end   := (date_trunc('month', v_performed_date) + INTERVAL '1 month - 1 day')::date;
      ELSIF v_visit.frequency_type = 'PER_WEEK' THEN
        v_period_start := date_trunc('week', v_performed_date)::date;
        v_period_end   := (date_trunc('week', v_performed_date) + INTERVAL '6 days')::date;
      ELSIF v_visit.frequency_type = 'PER_VISIT' THEN
        v_period_start := v_performed_date;
        v_period_end   := v_performed_date;
      ELSE
        v_period_start := NULL;
        v_period_end   := NULL;
      END IF;

      IF EXISTS (
        SELECT 1
          FROM public.invoice_line_items ili
          JOIN public.invoices inv ON inv.id = ili.invoice_id
         WHERE ili.contract_line_item_id = v_visit.id
           AND inv.id <> v_new_invoice_id
           AND inv.status IN ('DRAFT','ISSUED','PAID','OVERDUE')
           AND (
             v_visit.frequency_type = 'ONE_TIME'
             OR v_visit.frequency_type IS NULL
             OR (v_period_start IS NOT NULL
                 AND inv.period_start IS NOT NULL
                 AND inv.period_start <= v_period_end
                 AND COALESCE(inv.period_end, inv.period_start) >= v_period_start)
           )
      ) THEN
        CONTINUE;
      END IF;

      -- When reusing an invoice, don't add the same contract line twice.
      IF EXISTS (
        SELECT 1 FROM public.invoice_line_items
         WHERE invoice_id = v_new_invoice_id
           AND contract_line_item_id = v_visit.id
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, tenant_id, contract_line_item_id, service_order_id,
        description, quantity, unit_price, line_group
      ) VALUES (
        v_new_invoice_id, v_tenant_id, v_visit.id, _service_order_id,
        COALESCE(v_visit.custom_name, v_visit.catalog_name, 'Serviciu contract'),
        COALESCE(v_visit.quantity, 1),
        COALESCE(v_visit.unit_price, 0),
        'CONTRACT'
      );
      v_lines_added := v_lines_added + 1;
    END LOOP;
  END IF;

  INSERT INTO public.invoice_line_items (
    invoice_id, tenant_id, service_order_item_id, service_order_id,
    description, quantity, unit_price, line_group
  )
  SELECT v_new_invoice_id, v_tenant_id, soi.id, _service_order_id,
         COALESCE(soi.name, sc.name, 'Serviciu ad-hoc'),
         COALESCE(soi.quantity, 1),
         COALESCE(soi.unit_price, 0),
         'ADHOC'
    FROM public.service_order_items soi
    LEFT JOIN public.service_catalog sc ON sc.id = soi.service_catalog_id
   WHERE soi.service_order_id = _service_order_id
     AND soi.is_completed = true
     AND (soi.source = 'AD_HOC' OR soi.contract_line_item_id IS NULL AND v_contract_id IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_line_items ili
        WHERE ili.invoice_id = v_new_invoice_id
          AND ili.service_order_item_id = soi.id
     );

  GET DIAGNOSTICS v_lines_added = ROW_COUNT;

  IF NOT v_reused THEN
    IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_new_invoice_id) THEN
      DELETE FROM public.invoices WHERE id = v_new_invoice_id;
      RETURN NULL;
    END IF;
  END IF;

  RETURN v_new_invoice_id;
END; $function$;

-- Billing problems must never block closing a visit.
CREATE OR REPLACE FUNCTION public.trg_service_orders_invoice_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    BEGIN
      PERFORM public.fn_generate_invoice_for_visit(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'invoice generation failed for visit %: %', NEW.id, SQLERRM;
    END;
  ELSIF OLD.status = 'COMPLETED' AND NEW.status IS DISTINCT FROM 'COMPLETED' THEN
    DELETE FROM public.invoices
     WHERE service_order_id = NEW.id
       AND status = 'DRAFT';
  END IF;
  RETURN NEW;
END; $function$;