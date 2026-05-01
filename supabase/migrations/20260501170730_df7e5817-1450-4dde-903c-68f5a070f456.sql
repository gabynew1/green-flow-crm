CREATE OR REPLACE FUNCTION public._apply_task_side_effects(_task_id uuid, _action text)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  t              public.action_tasks%ROWTYPE;
  v_props        uuid[];
  v_client_profile RECORD;
  v_offer_id     uuid;
  v_contract_id  uuid;
  v_inspection_id uuid;
  v_initiator_name text;
  v_connection_id uuid;
  dup            RECORD;
BEGIN
  SELECT * INTO t FROM public.action_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ============ Reject ============
  IF _action = 'reject' THEN
    IF t.task_type = 'offer_response' THEN
      v_offer_id := COALESCE((t.payload->>'offer_id')::uuid, t.subject_entity_id);
      IF v_offer_id IS NOT NULL THEN
        UPDATE public.offers SET status = 'REJECTED' WHERE id = v_offer_id;
      END IF;
    ELSIF t.task_type = 'contract_response' THEN
      v_contract_id := COALESCE((t.payload->>'contract_id')::uuid, t.subject_entity_id);
      IF v_contract_id IS NOT NULL THEN
        UPDATE public.contracts SET status = 'REJECTED' WHERE id = v_contract_id;
      END IF;
    ELSIF t.task_type = 'inspection_confirmation' THEN
      v_inspection_id := COALESCE((t.payload->>'inspection_id')::uuid, t.subject_entity_id);
      IF v_inspection_id IS NOT NULL THEN
        UPDATE public.inspections
          SET status = 'DRAFT', inspected_date = NULL,
              notes = CASE WHEN notes IS NULL OR length(notes)=0
                           THEN 'Client declined the proposed date'
                           ELSE notes || E'\n[Client declined the proposed date]' END
          WHERE id = v_inspection_id;
      END IF;
    END IF;
    RETURN;
  END IF;

  -- ============ Approve ============
  IF t.task_type = 'link_request' THEN
    SELECT customer_id, user_id, full_name, email, company_name INTO v_client_profile
      FROM public.profiles WHERE user_id = t.initiator_user_id;
    SELECT ARRAY(SELECT jsonb_array_elements_text(t.payload->'property_ids'))::uuid[] INTO v_props;

    IF v_client_profile.customer_id IS NOT NULL THEN
      -- HARDENING: merge any duplicate provider-side customer rows that would
      -- otherwise collide on the (lower(email), tenant_id) unique constraint.
      FOR dup IN
        SELECT cu.id
        FROM public.customers cu
        JOIN public.customers main ON main.id = v_client_profile.customer_id
        WHERE cu.tenant_id = t.tenant_id
          AND cu.id <> v_client_profile.customer_id
          AND (
            (cu.email IS NOT NULL AND main.email IS NOT NULL
              AND lower(cu.email) = lower(main.email))
            OR (cu.name = main.name)
          )
      LOOP
        UPDATE public.properties  SET customer_id = v_client_profile.customer_id WHERE customer_id = dup.id;
        UPDATE public.offers      SET customer_id = v_client_profile.customer_id WHERE customer_id = dup.id;
        UPDATE public.inspections SET customer_id = v_client_profile.customer_id WHERE customer_id = dup.id;
        -- Free up the unique (lower(email), tenant_id) slot
        UPDATE public.customers
          SET email = NULL, tenant_id = NULL, status = 'INACTIVE', updated_at = now()
          WHERE id = dup.id;
      END LOOP;

      -- Tag the client's own customer with provider tenant -> shared row.
      UPDATE public.customers
        SET tenant_id = t.tenant_id, status = 'ACTIVE', updated_at = now()
        WHERE id = v_client_profile.customer_id;

      IF v_props IS NOT NULL AND array_length(v_props,1) > 0 THEN
        UPDATE public.properties
          SET tenant_id = t.tenant_id, updated_at = now()
          WHERE id = ANY(v_props) AND customer_id = v_client_profile.customer_id;
        UPDATE public.inventory SET tenant_id = t.tenant_id WHERE property_id = ANY(v_props);
        UPDATE public.inventory_items SET tenant_id = t.tenant_id
          WHERE inventory_id IN (SELECT id FROM public.inventory WHERE property_id = ANY(v_props));
      END IF;
    END IF;

    INSERT INTO public.client_connections (
      client_user_id, tenant_id, status, requested_by, provider_name, responded_at
    ) VALUES (
      t.initiator_user_id, t.tenant_id, 'APPROVED', t.initiator_user_id,
      t.payload->>'provider_name', now()
    ) ON CONFLICT DO NOTHING
    RETURNING id INTO v_connection_id;

    v_initiator_name := COALESCE(
      v_client_profile.full_name,
      v_client_profile.company_name,
      v_client_profile.email,
      'A client'
    );

    INSERT INTO public.user_notifications (user_id, tenant_id, kind, title, body, entity_type, entity_id, task_id)
    SELECT p.user_id, t.tenant_id, 'connection_approved'::notification_kind,
           'New customer linked',
           v_initiator_name || ' is now linked. Start contracting from the Sales Pipeline.',
           'client_connection', COALESCE(v_connection_id, t.id), t.id
    FROM public.profiles p
    WHERE p.tenant_id = t.tenant_id
      AND p.provider_permission IS NOT NULL
    ON CONFLICT DO NOTHING;

  ELSIF t.task_type = 'offer_response' THEN
    v_offer_id := COALESCE((t.payload->>'offer_id')::uuid, t.subject_entity_id);
    IF v_offer_id IS NOT NULL THEN
      UPDATE public.offers SET status = 'ACCEPTED' WHERE id = v_offer_id;
    END IF;
  ELSIF t.task_type = 'contract_response' THEN
    v_contract_id := COALESCE((t.payload->>'contract_id')::uuid, t.subject_entity_id);
    IF v_contract_id IS NOT NULL THEN
      UPDATE public.contracts SET status = 'ACTIVE' WHERE id = v_contract_id;
    END IF;
  ELSIF t.task_type = 'inspection_confirmation' THEN
    v_inspection_id := COALESCE((t.payload->>'inspection_id')::uuid, t.subject_entity_id);
    IF v_inspection_id IS NOT NULL THEN
      UPDATE public.inspections
        SET status = 'SCHEDULED',
            inspected_date = COALESCE((t.payload->>'scheduled_date')::date, inspected_date)
        WHERE id = v_inspection_id;
    END IF;
  END IF;
END $fn$;