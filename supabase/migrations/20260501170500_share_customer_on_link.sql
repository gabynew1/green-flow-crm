-- =====================================================================
-- Make linked customers a single shared record (visible to client + provider)
-- =====================================================================
-- Root cause: the previous link logic created/used a SEPARATE customer row
-- in the provider's tenant, and the client's profile pointed to a different
-- (tenant-less) customer row. Result: the property's customer_id matched the
-- client's row but not the provider's tenant-scoped customer list, so the
-- provider's UI (which lists customers first, then properties) couldn't see
-- the property even though the property itself was tenant-tagged.
--
-- Fix: one customer row per client. On link approval we tag the client's
-- own customer row with the provider tenant_id. Both sides then read the
-- same row. We also merge any leftover duplicates from the old logic.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._apply_task_side_effects(_task_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  t public.action_tasks%ROWTYPE;
  v_props uuid[];
  v_client_profile RECORD;
  v_inspection_id uuid;
  v_offer_id uuid;
  v_contract_id uuid;
BEGIN
  SELECT * INTO t FROM public.action_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF _action <> 'approve' THEN
    IF t.task_type = 'offer_response' THEN
      v_offer_id := COALESCE((t.payload->>'offer_id')::uuid, t.subject_entity_id);
      IF v_offer_id IS NOT NULL THEN
        UPDATE public.offers SET status = 'REJECTED',
          rejection_comment = COALESCE(rejection_comment, 'Rejected by client')
          WHERE id = v_offer_id;
      END IF;
    ELSIF t.task_type = 'contract_response' THEN
      v_contract_id := COALESCE((t.payload->>'contract_id')::uuid, t.subject_entity_id);
      IF v_contract_id IS NOT NULL THEN
        UPDATE public.contracts SET status = 'REJECTED',
          rejection_comment = COALESCE(rejection_comment, 'Rejected by client')
          WHERE id = v_contract_id;
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
    SELECT customer_id, user_id INTO v_client_profile
      FROM public.profiles WHERE user_id = t.initiator_user_id;
    SELECT ARRAY(SELECT jsonb_array_elements_text(t.payload->'property_ids'))::uuid[] INTO v_props;

    IF v_client_profile.customer_id IS NOT NULL THEN
      -- KEY: tag the client's own customer with provider tenant -> shared row.
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
    ) ON CONFLICT DO NOTHING;

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

-- =====================================================================
-- Backfill for every existing approved client_connection
-- =====================================================================
DO $bf$
DECLARE
  c RECORD;
  v_main uuid;
  dup RECORD;
BEGIN
  FOR c IN
    SELECT DISTINCT cc.client_user_id, cc.tenant_id
    FROM public.client_connections cc
    WHERE cc.status = 'APPROVED'
  LOOP
    SELECT customer_id INTO v_main FROM public.profiles
      WHERE user_id = c.client_user_id LIMIT 1;
    IF v_main IS NULL THEN CONTINUE; END IF;

    UPDATE public.customers
      SET tenant_id = c.tenant_id, status = 'ACTIVE', updated_at = now()
      WHERE id = v_main;

    -- Merge any duplicate provider-side customer rows (created by old logic)
    FOR dup IN
      SELECT cu.id FROM public.customers cu
      JOIN public.customers main ON main.id = v_main
      WHERE cu.tenant_id = c.tenant_id
        AND cu.id <> v_main
        AND (cu.email = main.email OR cu.name = main.name)
    LOOP
      UPDATE public.properties      SET customer_id = v_main WHERE customer_id = dup.id;
      UPDATE public.offers          SET customer_id = v_main WHERE customer_id = dup.id;
      UPDATE public.inspections     SET customer_id = v_main WHERE customer_id = dup.id;
      UPDATE public.customers       SET status = 'INACTIVE', tenant_id = NULL WHERE id = dup.id;
    END LOOP;
  END LOOP;
END $bf$;
