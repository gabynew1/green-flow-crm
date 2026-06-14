
CREATE OR REPLACE FUNCTION public.client_delink_property(_property_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_customer uuid;
  _prop record;
  _blocking int;
  _canceled int := 0;
BEGIN
  _caller_customer := public.get_user_customer_id(auth.uid());
  IF _caller_customer IS NULL THEN
    RAISE EXCEPTION 'Not a client account' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, tenant_id, customer_id
    INTO _prop
    FROM public.properties
   WHERE id = _property_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Property not found' USING ERRCODE = 'P0002';
  END IF;

  IF _prop.customer_id IS DISTINCT FROM _caller_customer THEN
    RAISE EXCEPTION 'You do not own this property' USING ERRCODE = '42501';
  END IF;

  IF _prop.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Property is not linked to any provider' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _blocking
    FROM public.contracts
   WHERE property_id = _property_id
     AND coalesce(archived, false) = false
     AND status IN ('ACTIVE', 'SENT_TO_CLIENT');

  IF _blocking > 0 THEN
    RAISE EXCEPTION 'Cannot delink: % active or pending contract(s) on this property. Close or reject them first.', _blocking
      USING ERRCODE = 'P0001';
  END IF;

  -- Cancel upcoming visits tied to this provider
  WITH upd AS (
    UPDATE public.service_orders
       SET status = 'CANCELED',
           notes  = coalesce(notes || E'\n', '') || 'Property delinked from provider by client',
           updated_at = now()
     WHERE property_id = _property_id
       AND tenant_id = _prop.tenant_id
       AND status IN ('SCHEDULED', 'PENDING_APPROVAL')
       AND (scheduled_date IS NULL OR scheduled_date >= current_date)
    RETURNING 1
  )
  SELECT count(*) INTO _canceled FROM upd;

  -- Clear the provider link
  UPDATE public.properties
     SET tenant_id = NULL,
         updated_at = now()
   WHERE id = _property_id;

  -- Audit
  INSERT INTO public.activity_log (
    event_type, event_description, related_entity_type, related_entity_id,
    property_id, created_by, tenant_id
  ) VALUES (
    'property_delinked',
    'Client delinked property from provider',
    'property', _property_id,
    _property_id, auth.uid(), _prop.tenant_id
  );

  RETURN jsonb_build_object('ok', true, 'canceled_visits', _canceled);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.client_delink_property(uuid) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.client_delink_property(uuid) TO authenticated;
