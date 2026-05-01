CREATE OR REPLACE FUNCTION public.close_contract_with_cleanup(
  _contract_id uuid,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_contract RECORD;
  v_tz text;
  v_business_date date;
  v_snapshot jsonb;
  v_count integer := 0;
  v_new_end_date date;
  v_client_user uuid;
  v_admin uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.* INTO v_contract FROM public.contracts c WHERE c.id = _contract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  v_tenant := v_contract.tenant_id;

  IF NOT public.is_provider(v_actor)
     OR public.get_user_tenant_id(v_actor) IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'Not authorized to close this contract';
  END IF;

  -- Idempotent: if already closed, return safely
  IF v_contract.status = 'CLOSED' THEN
    RETURN jsonb_build_object(
      'already_closed', true,
      'canceled_count', 0,
      'closed_on', v_contract.end_date,
      'reason', _reason
    );
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  -- Tenant timezone (defaults already enforced by column default)
  SELECT COALESCE(timezone, 'Europe/Bucharest') INTO v_tz
    FROM public.tenants WHERE id = v_tenant;
  IF v_tz IS NULL THEN v_tz := 'Europe/Bucharest'; END IF;

  v_business_date := (now() AT TIME ZONE v_tz)::date;

  -- Snapshot of future visits to be cancelled
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', so.id,
      'scheduled_date', so.scheduled_date,
      'status', so.status,
      'period_label', so.period_label,
      'team_id', so.team_id
    ) ORDER BY so.scheduled_date), '[]'::jsonb),
    COUNT(*)
  INTO v_snapshot, v_count
  FROM public.service_orders so
  WHERE so.contract_id = _contract_id
    AND so.scheduled_date IS NOT NULL
    AND so.scheduled_date > v_business_date;

  -- Audit log first (before destructive ops)
  INSERT INTO public.contract_closure_events (
    contract_id, tenant_id, closed_by_user_id,
    closed_on_local_date, closed_at_utc, reason,
    canceled_visits_count, canceled_visits_snapshot
  ) VALUES (
    _contract_id, v_tenant, v_actor,
    v_business_date, now(), btrim(_reason),
    v_count, v_snapshot
  );

  -- Delete future service orders (and their items)
  IF v_count > 0 THEN
    DELETE FROM public.service_order_items
      WHERE service_order_id IN (
        SELECT id FROM public.service_orders
        WHERE contract_id = _contract_id
          AND scheduled_date IS NOT NULL
          AND scheduled_date > v_business_date
      );
    DELETE FROM public.service_orders
      WHERE contract_id = _contract_id
        AND scheduled_date IS NOT NULL
        AND scheduled_date > v_business_date;
  END IF;

  -- Compute new end_date: only earlier or set if null; never extend.
  IF v_contract.end_date IS NULL OR v_contract.end_date > v_business_date THEN
    v_new_end_date := v_business_date;
  ELSE
    v_new_end_date := v_contract.end_date;
  END IF;

  UPDATE public.contracts
    SET status = 'CLOSED',
        end_date = v_new_end_date,
        updated_at = now()
    WHERE id = _contract_id;

  -- Resolve client user via property -> customer -> profile
  SELECT pr.user_id INTO v_client_user
    FROM public.properties p
    JOIN public.profiles pr ON pr.customer_id = p.customer_id
    WHERE p.id = v_contract.property_id
    LIMIT 1;

  -- Notify client (deduped on (user_id, kind, entity_id))
  IF v_client_user IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, tenant_id, kind, title, body, entity_type, entity_id)
    SELECT v_client_user, v_tenant, 'contract_closed'::public.notification_kind,
           'Contract closed',
           'The contract "' || COALESCE(v_contract.contract_name, 'Contract') ||
             '" and all related future visits have been cancelled.',
           'contract', _contract_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.user_id = v_client_user
        AND n.kind = 'contract_closed'::public.notification_kind
        AND n.entity_id = _contract_id
    );
  END IF;

  -- Notify other provider admins
  FOR v_admin IN SELECT public._provider_admin_user_ids(v_tenant) LOOP
    IF v_admin IS NULL OR v_admin = v_actor OR v_admin = v_client_user THEN
      CONTINUE;
    END IF;
    INSERT INTO public.user_notifications (user_id, tenant_id, kind, title, body, entity_type, entity_id)
    SELECT v_admin, v_tenant, 'contract_closed'::public.notification_kind,
           'Contract closed',
           'The contract "' || COALESCE(v_contract.contract_name, 'Contract') ||
             '" and all related future visits have been cancelled.',
           'contract', _contract_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.user_id = v_admin
        AND n.kind = 'contract_closed'::public.notification_kind
        AND n.entity_id = _contract_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'already_closed', false,
    'canceled_count', v_count,
    'closed_on', v_business_date,
    'reason', btrim(_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_contract_with_cleanup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_contract_with_cleanup(uuid, text) TO authenticated;
