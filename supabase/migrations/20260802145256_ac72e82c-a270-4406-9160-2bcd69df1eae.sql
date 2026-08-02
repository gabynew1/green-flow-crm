ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS is_one_time_project boolean NOT NULL DEFAULT false;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS line_group text NOT NULL DEFAULT 'CONTRACT';

-- Guard: never auto-invoice a visit belonging to a one-time project contract
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_visit(_service_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- One-time projects are invoiced once from the contract, not per visit
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
     AND (soi.source = 'AD_HOC' OR soi.contract_line_item_id IS NULL AND v_contract_id IS NULL);

  GET DIAGNOSTICS v_lines_added = ROW_COUNT;

  IF v_new_invoice_id <> COALESCE(v_existing_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    IF NOT EXISTS (SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_new_invoice_id) THEN
      DELETE FROM public.invoices WHERE id = v_new_invoice_id;
      RETURN NULL;
    END IF;
  END IF;

  RETURN v_new_invoice_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_for_visit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_for_visit(uuid) TO service_role;

-- ============ SINGLE PROJECT INVOICE ============
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_project(_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c            record;
  v_currency   text;
  v_existing   uuid;
  v_invoice_id uuid;
  v_caller_tenant uuid;
BEGIN
  SELECT co.*, pr.customer_id AS cust_id, pr.id AS prop_id
    INTO c
    FROM public.contracts co
    JOIN public.properties pr ON pr.id = co.property_id
   WHERE co.id = _contract_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'contract % not found', _contract_id; END IF;

  v_caller_tenant := public.get_user_tenant_id();
  IF v_caller_tenant IS NULL OR v_caller_tenant <> c.tenant_id THEN
    IF NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'not authorized for this contract';
    END IF;
  END IF;

  SELECT id INTO v_existing
    FROM public.invoices
   WHERE contract_id = _contract_id
     AND source = 'CONTRACT_CYCLE'
     AND status <> 'CANCELED'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT currency INTO v_currency FROM public.tenants WHERE id = c.tenant_id;

  INSERT INTO public.invoices (
    tenant_id, customer_id, contract_id, property_id, period_start, period_end,
    issue_date, due_date, currency, status, source
  ) VALUES (
    c.tenant_id, c.cust_id, _contract_id, c.prop_id, c.start_date, c.end_date,
    CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', COALESCE(v_currency, 'RON'),
    'DRAFT', 'CONTRACT_CYCLE'
  )
  RETURNING id INTO v_invoice_id;

  -- Contract scope lines
  INSERT INTO public.invoice_line_items (
    invoice_id, tenant_id, contract_line_item_id, description, quantity, unit_price, line_group
  )
  SELECT v_invoice_id, c.tenant_id, cli.id,
         COALESCE(cli.custom_name, sc.name, 'Serviciu'),
         COALESCE(cli.quantity, 1),
         COALESCE(cli.unit_price, 0),
         'CONTRACT'
    FROM public.contract_line_items cli
    LEFT JOIN public.service_catalog sc ON sc.id = cli.service_catalog_id
   WHERE cli.contract_id = _contract_id
     AND COALESCE(cli.is_included_in_base_fee, false) = false;

  -- Ad-hoc extras delivered during the project
  INSERT INTO public.invoice_line_items (
    invoice_id, tenant_id, service_order_item_id, service_order_id,
    description, quantity, unit_price, line_group
  )
  SELECT v_invoice_id, c.tenant_id, soi.id, so.id,
         COALESCE(soi.name, sc.name, 'Serviciu suplimentar'),
         COALESCE(soi.quantity, 1),
         COALESCE(soi.unit_price, 0),
         'ADHOC'
    FROM public.service_order_items soi
    JOIN public.service_orders so ON so.id = soi.service_order_id
    LEFT JOIN public.service_catalog sc ON sc.id = soi.service_catalog_id
   WHERE so.contract_id = _contract_id
     AND soi.source = 'AD_HOC'
     AND soi.is_completed = true
     AND so.status IN ('COMPLETED','APPROVED','SENT_TO_CLIENT')
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_line_items x
        JOIN public.invoices xi ON xi.id = x.invoice_id
        WHERE x.service_order_item_id = soi.id
          AND xi.status <> 'CANCELED'
     );

  RETURN v_invoice_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_for_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_for_project(uuid) TO service_role;