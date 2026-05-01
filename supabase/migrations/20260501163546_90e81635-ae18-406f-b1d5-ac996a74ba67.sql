-- =====================================================
-- A. DATA REPAIR for Sonia Pintea
-- =====================================================
-- Re-point her two properties from the duplicate provider-side customer
-- back to her own profile customer, while keeping tenant_id = Serene Garden.
UPDATE public.properties
SET customer_id = '456bbd8e-5579-41ce-aa5e-38ac7aa70c91',
    updated_at = now()
WHERE id IN (
  'a1abcd76-fa12-4dd7-ab36-c371f67a8a4e',
  'd8a7dfa4-32b3-4ea0-ab78-d4ddef2ef9c0'
)
AND customer_id = '9c3518b2-9898-4206-be19-d74d075d4ed5';

-- Mark the duplicate provider-side customer record as INACTIVE
UPDATE public.customers
SET status = 'INACTIVE', updated_at = now()
WHERE id = '9c3518b2-9898-4206-be19-d74d075d4ed5'
  AND NOT EXISTS (
    SELECT 1 FROM public.properties WHERE customer_id = '9c3518b2-9898-4206-be19-d74d075d4ed5'
  );

-- =====================================================
-- B. FIX _apply_task_side_effects for link_request
-- =====================================================
-- Now SHARES data instead of MIGRATING it: properties keep client's customer_id,
-- only tenant_id is set so the provider can see them via RLS.
CREATE OR REPLACE FUNCTION public._apply_task_side_effects(_task_id uuid, _action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.action_tasks%ROWTYPE;
  v_props uuid[];
  v_client_user uuid;
  v_client_profile public.profiles%ROWTYPE;
  v_tenant_name text;
  v_admin uuid;
  v_property record;
  v_dup_customer uuid;
BEGIN
  SELECT * INTO t FROM public.action_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF _action <> 'approve' THEN
    IF t.task_type = 'offer_response' AND t.subject_entity_id IS NOT NULL THEN
      UPDATE public.offers SET status = 'REJECTED' WHERE id = t.subject_entity_id;
    ELSIF t.task_type = 'contract_response' AND t.subject_entity_id IS NOT NULL THEN
      UPDATE public.contracts SET status = 'REJECTED' WHERE id = t.subject_entity_id;
    END IF;
    RETURN;
  END IF;

  IF t.task_type = 'link_request' THEN
    IF public.is_provider(t.initiator_user_id) THEN
      v_client_user := t.target_user_id;
    ELSE
      v_client_user := t.initiator_user_id;
    END IF;

    IF v_client_user IS NULL THEN
      RETURN;
    END IF;

    SELECT * INTO v_client_profile FROM public.profiles WHERE user_id = v_client_user;
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = t.tenant_id;

    -- Selected properties to share
    SELECT ARRAY(SELECT (jsonb_array_elements_text(COALESCE(t.payload->'property_ids','[]'::jsonb)))::uuid)
      INTO v_props;

    -- If a stale provider-side duplicate customer exists for this client (same email, same tenant),
    -- mark it inactive — the client's own customer_id is the source of truth now.
    IF v_client_profile.email IS NOT NULL AND v_client_profile.customer_id IS NOT NULL THEN
      FOR v_dup_customer IN
        SELECT id FROM public.customers
         WHERE tenant_id = t.tenant_id
           AND id <> v_client_profile.customer_id
           AND lower(COALESCE(email,'')) = lower(v_client_profile.email)
      LOOP
        -- Re-point any properties pointing at the duplicate back to the client's customer
        UPDATE public.properties
           SET customer_id = v_client_profile.customer_id, updated_at = now()
         WHERE customer_id = v_dup_customer;
        UPDATE public.customers
           SET status = 'INACTIVE', updated_at = now()
         WHERE id = v_dup_customer;
      END LOOP;
    END IF;

    IF v_props IS NOT NULL AND array_length(v_props,1) > 0 THEN
      -- Tag selected properties with the provider tenant; preserve client's customer_id.
      UPDATE public.properties
        SET tenant_id = t.tenant_id,
            updated_at = now()
      WHERE id = ANY(v_props)
        AND customer_id = v_client_profile.customer_id;

      -- Ensure inventory rows exist and are tenant-tagged so providers can manage them via RLS
      INSERT INTO public.inventory (property_id, tenant_id)
      SELECT p.id, t.tenant_id
        FROM public.properties p
       WHERE p.id = ANY(v_props)
         AND NOT EXISTS (SELECT 1 FROM public.inventory i WHERE i.property_id = p.id);

      UPDATE public.inventory
         SET tenant_id = t.tenant_id, updated_at = now()
       WHERE property_id = ANY(v_props);

      UPDATE public.inventory_items
         SET tenant_id = t.tenant_id, updated_at = now()
       WHERE inventory_id IN (SELECT id FROM public.inventory WHERE property_id = ANY(v_props));

      -- Activity log entry per property
      FOR v_property IN
        SELECT id, name FROM public.properties WHERE id = ANY(v_props)
      LOOP
        INSERT INTO public.activity_log (
          tenant_id, property_id, event_type, event_description,
          related_entity_type, related_entity_id, created_by
        ) VALUES (
          t.tenant_id, v_property.id, 'customer_linked',
          'Customer ' || COALESCE(v_client_profile.full_name,'(client)') ||
          ' shared property "' || v_property.name || '" with ' || COALESCE(v_tenant_name,'provider'),
          'customer', v_client_profile.customer_id, NULL
        );
      END LOOP;
    END IF;

    -- client_connections row
    INSERT INTO public.client_connections (
      client_user_id, tenant_id, status, requested_by, provider_name, responded_at
    ) VALUES (
      v_client_user, t.tenant_id, 'APPROVED', t.initiator_user_id,
      COALESCE(t.payload->>'provider_name', v_tenant_name, 'Provider'), now()
    ) ON CONFLICT DO NOTHING;

    UPDATE public.client_connections
       SET status = 'APPROVED', responded_at = now()
     WHERE client_user_id = v_client_user
       AND tenant_id = t.tenant_id
       AND status <> 'APPROVED';

    -- Notify provider admins
    FOR v_admin IN SELECT public._provider_admin_user_ids(t.tenant_id) LOOP
      PERFORM public._emit_notification(
        v_admin, t.tenant_id, 'connection_approved',
        'New customer connected',
        COALESCE(v_client_profile.full_name,'A client') ||
        ' shared ' || COALESCE(array_length(v_props,1),0)::text || ' property(ies)',
        'customer', v_client_profile.customer_id, NULL
      );
    END LOOP;

  ELSIF t.task_type = 'offer_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.offers SET status = 'ACCEPTED' WHERE id = t.subject_entity_id;
  ELSIF t.task_type = 'contract_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.contracts SET status = 'ACTIVE' WHERE id = t.subject_entity_id;
  END IF;
END
$function$;