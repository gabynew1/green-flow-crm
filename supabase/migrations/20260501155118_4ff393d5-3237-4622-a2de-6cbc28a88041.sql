CREATE OR REPLACE FUNCTION public._apply_task_side_effects(_task_id uuid, _action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  t public.action_tasks%ROWTYPE;
  v_props uuid[];
  v_client_user uuid;
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

  -- Approve side effects
  IF t.task_type = 'link_request' THEN
    -- Determine which side is the client. Provider can initiate too.
    IF public.is_provider(t.initiator_user_id) THEN
      v_client_user := t.target_user_id;
    ELSE
      v_client_user := t.initiator_user_id;
    END IF;

    -- Optional property links from payload
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(t.payload->'property_ids','[]'::jsonb)))::uuid[]
      INTO v_props;
    IF v_client_user IS NOT NULL AND array_length(v_props,1) > 0 THEN
      UPDATE public.properties
        SET tenant_id = t.tenant_id
        WHERE id = ANY(v_props)
          AND customer_id = public.get_user_customer_id(v_client_user);
    END IF;

    IF v_client_user IS NOT NULL THEN
      INSERT INTO public.client_connections (
        client_user_id, tenant_id, status, requested_by, provider_name, responded_at
      ) VALUES (
        v_client_user, t.tenant_id, 'APPROVED', t.initiator_user_id,
        COALESCE(t.payload->>'provider_name','Provider'), now()
      ) ON CONFLICT DO NOTHING;
    END IF;
  ELSIF t.task_type = 'offer_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.offers SET status = 'ACCEPTED' WHERE id = t.subject_entity_id;
  ELSIF t.task_type = 'contract_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.contracts SET status = 'ACTIVE' WHERE id = t.subject_entity_id;
  END IF;
END
$function$;