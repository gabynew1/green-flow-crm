-- =====================================================================
-- Sales pipeline → Tasks + Schedule unification
-- =====================================================================

-- 1) Extend _apply_task_side_effects to handle inspection_confirmation
CREATE OR REPLACE FUNCTION public._apply_task_side_effects(
  _task_id uuid,
  _action text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
    -- Reject side effects
    IF t.task_type = 'offer_response' THEN
      v_offer_id := COALESCE((t.payload->>'offer_id')::uuid, t.subject_entity_id);
      IF v_offer_id IS NOT NULL THEN
        UPDATE public.offers SET status = 'REJECTED', rejection_comment = COALESCE(rejection_comment, 'Rejected by client')
          WHERE id = v_offer_id;
      END IF;
    ELSIF t.task_type = 'contract_response' THEN
      v_contract_id := COALESCE((t.payload->>'contract_id')::uuid, t.subject_entity_id);
      IF v_contract_id IS NOT NULL THEN
        UPDATE public.contracts SET status = 'REJECTED', rejection_comment = COALESCE(rejection_comment, 'Rejected by client')
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

  -- Approve side effects
  IF t.task_type = 'link_request' THEN
    SELECT customer_id, user_id INTO v_client_profile
      FROM public.profiles WHERE user_id = t.initiator_user_id;
    SELECT ARRAY(SELECT jsonb_array_elements_text(t.payload->'property_ids'))::uuid[] INTO v_props;
    IF array_length(v_props,1) > 0 AND v_client_profile.customer_id IS NOT NULL THEN
      UPDATE public.properties
        SET tenant_id = t.tenant_id, updated_at = now()
        WHERE id = ANY(v_props) AND customer_id = v_client_profile.customer_id;
      UPDATE public.inventory SET tenant_id = t.tenant_id WHERE property_id = ANY(v_props);
      UPDATE public.inventory_items SET tenant_id = t.tenant_id
        WHERE inventory_id IN (SELECT id FROM public.inventory WHERE property_id = ANY(v_props));
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
END $$;

-- 2) Helper: emit_offer_response_task
CREATE OR REPLACE FUNCTION public.emit_offer_response_task(_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_offer RECORD;
  v_client_user uuid;
  v_existing uuid;
  v_task_id uuid;
  v_initiator_role text;
BEGIN
  SELECT o.*, p.customer_id AS prop_customer_id, p.id AS prop_id
    INTO v_offer
  FROM public.offers o
  JOIN public.properties p ON p.id = o.property_id
  WHERE o.id = _offer_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Idempotent: skip if a pending task already exists
  SELECT id INTO v_existing FROM public.action_tasks
    WHERE task_type = 'offer_response' AND subject_entity_id = _offer_id AND status = 'pending'
    LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT user_id INTO v_client_user FROM public.profiles
    WHERE customer_id = v_offer.prop_customer_id LIMIT 1;
  IF v_client_user IS NULL THEN RETURN NULL; END IF;

  SELECT string_agg(role::text, ',') INTO v_initiator_role
    FROM public.user_roles WHERE user_id = COALESCE(auth.uid(), v_offer.created_by);

  INSERT INTO public.action_tasks (
    tenant_id, task_type, status, initiator_user_id, initiator_role,
    target_user_id, target_role, subject_entity_type, subject_entity_id, payload
  ) VALUES (
    v_offer.tenant_id, 'offer_response', 'pending',
    COALESCE(auth.uid(), v_offer.created_by), COALESCE(v_initiator_role,'provider'),
    v_client_user, 'client', 'offer', _offer_id,
    jsonb_build_object(
      'offer_id', _offer_id, 'property_id', v_offer.prop_id,
      'offer_name', v_offer.offer_name, 'total_value', v_offer.total_value,
      'valid_until', v_offer.valid_until
    )
  ) RETURNING id INTO v_task_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (v_task_id, v_offer.tenant_id, COALESCE(auth.uid(), v_offer.created_by),
          'created', jsonb_build_object('task_type','offer_response'));

  PERFORM public._emit_notification(
    v_client_user, v_offer.tenant_id, 'task_created',
    'New offer to review',
    COALESCE(v_offer.offer_name,'Offer') || ' is awaiting your response',
    'action_task', v_task_id, v_task_id
  );

  RETURN v_task_id;
END $$;

-- 3) Helper: emit_contract_response_task
CREATE OR REPLACE FUNCTION public.emit_contract_response_task(_contract_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_contract RECORD;
  v_client_user uuid;
  v_existing uuid;
  v_task_id uuid;
BEGIN
  SELECT c.*, p.customer_id AS prop_customer_id, p.id AS prop_id
    INTO v_contract
  FROM public.contracts c
  JOIN public.properties p ON p.id = c.property_id
  WHERE c.id = _contract_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_existing FROM public.action_tasks
    WHERE task_type = 'contract_response' AND subject_entity_id = _contract_id AND status = 'pending'
    LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT user_id INTO v_client_user FROM public.profiles
    WHERE customer_id = v_contract.prop_customer_id LIMIT 1;
  IF v_client_user IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.action_tasks (
    tenant_id, task_type, status, initiator_user_id, initiator_role,
    target_user_id, target_role, subject_entity_type, subject_entity_id, payload
  ) VALUES (
    v_contract.tenant_id, 'contract_response', 'pending',
    COALESCE(auth.uid(), v_contract.tenant_id), 'provider',
    v_client_user, 'client', 'contract', _contract_id,
    jsonb_build_object(
      'contract_id', _contract_id, 'property_id', v_contract.prop_id,
      'contract_name', v_contract.contract_name,
      'start_date', v_contract.start_date, 'end_date', v_contract.end_date,
      'billing_cycle', v_contract.billing_cycle
    )
  ) RETURNING id INTO v_task_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (v_task_id, v_contract.tenant_id, auth.uid(),
          'created', jsonb_build_object('task_type','contract_response'));

  PERFORM public._emit_notification(
    v_client_user, v_contract.tenant_id, 'task_created',
    'New contract to review',
    COALESCE(v_contract.contract_name,'Contract') || ' is awaiting your signature',
    'action_task', v_task_id, v_task_id
  );

  RETURN v_task_id;
END $$;

-- 4) Helper: emit_inspection_confirmation_task
CREATE OR REPLACE FUNCTION public.emit_inspection_confirmation_task(_inspection_id uuid, _scheduled_date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_insp RECORD;
  v_client_user uuid;
  v_existing uuid;
  v_task_id uuid;
BEGIN
  SELECT i.*, p.customer_id AS prop_customer_id, p.id AS prop_id, p.name AS prop_name
    INTO v_insp
  FROM public.inspections i
  JOIN public.properties p ON p.id = i.property_id
  WHERE i.id = _inspection_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id INTO v_existing FROM public.action_tasks
    WHERE task_type = 'inspection_confirmation' AND subject_entity_id = _inspection_id AND status = 'pending'
    LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT user_id INTO v_client_user FROM public.profiles
    WHERE customer_id = v_insp.prop_customer_id LIMIT 1;
  IF v_client_user IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.action_tasks (
    tenant_id, task_type, status, initiator_user_id, initiator_role,
    target_user_id, target_role, subject_entity_type, subject_entity_id, payload, due_at
  ) VALUES (
    v_insp.tenant_id, 'inspection_confirmation', 'pending',
    COALESCE(auth.uid(), v_insp.created_by), 'provider',
    v_client_user, 'client', 'inspection', _inspection_id,
    jsonb_build_object(
      'inspection_id', _inspection_id, 'property_id', v_insp.prop_id,
      'property_name', v_insp.prop_name, 'title', v_insp.title,
      'scheduled_date', _scheduled_date
    ),
    (_scheduled_date::timestamptz)
  ) RETURNING id INTO v_task_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (v_task_id, v_insp.tenant_id, auth.uid(),
          'created', jsonb_build_object('task_type','inspection_confirmation'));

  PERFORM public._emit_notification(
    v_client_user, v_insp.tenant_id, 'task_created',
    'Confirm inspection date',
    COALESCE(v_insp.title,'Inspection') || ' on ' || _scheduled_date::text,
    'action_task', v_task_id, v_task_id
  );

  RETURN v_task_id;
END $$;

-- Grants
REVOKE ALL ON FUNCTION public.emit_offer_response_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emit_offer_response_task(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.emit_contract_response_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emit_contract_response_task(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.emit_inspection_confirmation_task(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emit_inspection_confirmation_task(uuid, date) TO authenticated;

-- 5) Triggers — auto-emit when status flips to SENT_TO_CLIENT
CREATE OR REPLACE FUNCTION public._trg_offer_sent_to_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'SENT_TO_CLIENT' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.emit_offer_response_task(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_offer_sent_to_client ON public.offers;
CREATE TRIGGER trg_offer_sent_to_client
AFTER UPDATE OF status ON public.offers
FOR EACH ROW EXECUTE FUNCTION public._trg_offer_sent_to_client();

CREATE OR REPLACE FUNCTION public._trg_contract_sent_to_client()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'SENT_TO_CLIENT' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.emit_contract_response_task(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contract_sent_to_client ON public.contracts;
CREATE TRIGGER trg_contract_sent_to_client
AFTER UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public._trg_contract_sent_to_client();

-- 6) Backfill existing in-flight offers/contracts that have no pending task
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT o.id FROM public.offers o
    WHERE o.status = 'SENT_TO_CLIENT'
      AND NOT EXISTS (
        SELECT 1 FROM public.action_tasks at
        WHERE at.task_type='offer_response' AND at.subject_entity_id=o.id AND at.status='pending'
      )
  LOOP
    PERFORM public.emit_offer_response_task(r.id);
  END LOOP;

  FOR r IN
    SELECT c.id FROM public.contracts c
    WHERE c.status = 'SENT_TO_CLIENT'
      AND NOT EXISTS (
        SELECT 1 FROM public.action_tasks at
        WHERE at.task_type='contract_response' AND at.subject_entity_id=c.id AND at.status='pending'
      )
  LOOP
    PERFORM public.emit_contract_response_task(r.id);
  END LOOP;
END $$;
