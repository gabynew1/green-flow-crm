CREATE OR REPLACE FUNCTION public.fn_ensure_cycle_invoice(_contract_id uuid, _period_start date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Base contract scope lines (only lines that carry a cost)
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
   WHERE cli.contract_id = _contract_id
     AND (
       COALESCE(cli.is_included_in_base_fee, false) = false
       OR COALESCE(cli.unit_price, 0) <> 0
     );

  RETURN v_invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_contract_cycle(_contract_id uuid, _period_start date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Only lines that carry a cost
  INSERT INTO public.invoice_line_items (invoice_id, tenant_id, contract_line_item_id, description, quantity, unit_price)
  SELECT new_invoice_id, c.tenant_id, cli.id,
         COALESCE(cli.custom_name, sc.name, 'Serviciu'),
         COALESCE(cli.quantity, 1),
         COALESCE(cli.unit_price, 0)
    FROM public.contract_line_items cli
    LEFT JOIN public.service_catalog sc ON sc.id = cli.service_catalog_id
    WHERE cli.contract_id = _contract_id
     AND (
       COALESCE(cli.is_included_in_base_fee, false) = false
       OR COALESCE(cli.unit_price, 0) <> 0
     );

  RETURN new_invoice_id;
END; $function$;