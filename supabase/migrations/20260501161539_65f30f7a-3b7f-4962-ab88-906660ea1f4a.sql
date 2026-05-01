-- 1) Extend act_on_task with optional payload patch (backwards compatible)
CREATE OR REPLACE FUNCTION public.act_on_task(_task_id uuid, _action text, _comment text DEFAULT NULL, _payload_patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.action_tasks%ROWTYPE;
  v_new_status public.action_task_status;
  v_event_type public.action_task_event_type;
  v_kind public.notification_kind;
  v_can boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _action NOT IN ('approve','reject','cancel') THEN
    RAISE EXCEPTION 'Invalid action: %', _action;
  END IF;

  SELECT * INTO t FROM public.action_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'Task not pending (status=%)', t.status; END IF;

  IF _action = 'cancel' THEN
    v_can := (auth.uid() = t.initiator_user_id);
  ELSE
    v_can := (
      auth.uid() = t.target_user_id
      OR (
        t.target_user_id IS NULL
        AND public.is_provider(auth.uid())
        AND public.get_user_tenant_id(auth.uid()) = t.tenant_id
      )
    );
  END IF;
  IF NOT v_can THEN RAISE EXCEPTION 'Not authorized to % this task', _action; END IF;

  IF _action = 'reject' AND (_comment IS NULL OR length(trim(_comment)) = 0) THEN
    RAISE EXCEPTION 'A comment is required when rejecting';
  END IF;

  -- Merge payload patch (e.g. property_ids selected at approval time)
  IF _payload_patch IS NOT NULL AND _payload_patch <> '{}'::jsonb THEN
    UPDATE public.action_tasks
       SET payload = COALESCE(payload,'{}'::jsonb) || _payload_patch
     WHERE id = _task_id;
    SELECT * INTO t FROM public.action_tasks WHERE id = _task_id;
  END IF;

  v_new_status := CASE _action
    WHEN 'approve' THEN 'approved'::public.action_task_status
    WHEN 'reject'  THEN 'rejected'::public.action_task_status
    ELSE 'cancelled'::public.action_task_status END;
  v_event_type := CASE _action
    WHEN 'approve' THEN 'approved'::public.action_task_event_type
    WHEN 'reject'  THEN 'rejected'::public.action_task_event_type
    ELSE 'cancelled'::public.action_task_event_type END;
  v_kind := CASE _action
    WHEN 'approve' THEN 'task_approved'::public.notification_kind
    WHEN 'reject'  THEN 'task_rejected'::public.notification_kind
    ELSE 'task_expired'::public.notification_kind END;

  PERFORM public._apply_task_side_effects(_task_id, _action);

  UPDATE public.action_tasks SET status = v_new_status, updated_at = now() WHERE id = _task_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (_task_id, t.tenant_id, auth.uid(), v_event_type, jsonb_build_object('comment', _comment));

  IF _comment IS NOT NULL AND length(trim(_comment)) > 0 THEN
    INSERT INTO public.action_task_comments (task_id, tenant_id, author_user_id, body)
    VALUES (_task_id, t.tenant_id, auth.uid(), _comment);
  END IF;

  PERFORM public._emit_notification(
    t.initiator_user_id, t.tenant_id, v_kind,
    CASE _action
      WHEN 'approve' THEN 'Request approved'
      WHEN 'reject'  THEN 'Request rejected'
      ELSE 'Request cancelled' END,
    COALESCE(_comment, t.task_type::text || ' ' || _action || 'd'),
    'action_task', _task_id, _task_id
  );

  RETURN jsonb_build_object('ok', true, 'task_id', _task_id, 'status', v_new_status);
END $function$;

-- 2) Replace _apply_task_side_effects to share customer/properties/inventory with provider
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
  v_provider_customer uuid;
  v_tenant_name text;
  v_admin uuid;
  v_property record;
  v_billing_addr text;
  v_notes text;
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
    -- Identify client user (the non-provider side)
    IF public.is_provider(t.initiator_user_id) THEN
      v_client_user := t.target_user_id;
    ELSE
      v_client_user := t.initiator_user_id;
    END IF;

    IF v_client_user IS NULL THEN
      -- Nothing else to do without a client
      RETURN;
    END IF;

    SELECT * INTO v_client_profile FROM public.profiles WHERE user_id = v_client_user;
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = t.tenant_id;

    -- Compose billing address
    v_billing_addr := NULLIF(
      trim(both ', ' FROM concat_ws(', ',
        NULLIF(trim(COALESCE(v_client_profile.address_street,'')), ''),
        NULLIF(trim(COALESCE(v_client_profile.address_city,'')),   ''),
        NULLIF(trim(COALESCE(v_client_profile.address_county,'')), '')
      )),
      ''
    );

    v_notes := NULLIF(trim(concat_ws(E'\n',
      CASE WHEN v_client_profile.cui IS NOT NULL AND length(trim(v_client_profile.cui))>0
           THEN 'CUI: ' || v_client_profile.cui END,
      CASE WHEN v_client_profile.vat_id IS NOT NULL AND length(trim(v_client_profile.vat_id))>0
           THEN 'VAT: ' || v_client_profile.vat_id END,
      CASE WHEN v_client_profile.cnp IS NOT NULL AND length(trim(v_client_profile.cnp))>0
           THEN 'CNP: ' || v_client_profile.cnp END,
      CASE WHEN v_client_profile.client_type IS NOT NULL
           THEN 'Client type: ' || v_client_profile.client_type END
    )), '');

    -- Find/create provider-side customer for this client (match by email within tenant)
    IF v_client_profile.email IS NOT NULL THEN
      SELECT id INTO v_provider_customer
        FROM public.customers
       WHERE tenant_id = t.tenant_id
         AND lower(email) = lower(v_client_profile.email)
       LIMIT 1;
    END IF;

    IF v_provider_customer IS NULL THEN
      INSERT INTO public.customers (
        tenant_id, name, contact_person_name, email, phone,
        company_name, billing_address, notes, status
      ) VALUES (
        t.tenant_id,
        COALESCE(NULLIF(trim(v_client_profile.full_name),''), v_client_profile.email, 'Client'),
        v_client_profile.full_name,
        v_client_profile.email,
        v_client_profile.phone,
        v_client_profile.company_name,
        v_billing_addr,
        v_notes,
        'ACTIVE'
      ) RETURNING id INTO v_provider_customer;
    ELSE
      -- Refresh contact details so provider always has the latest
      UPDATE public.customers SET
        contact_person_name = COALESCE(v_client_profile.full_name, contact_person_name),
        email   = COALESCE(v_client_profile.email,   email),
        phone   = COALESCE(v_client_profile.phone,   phone),
        company_name    = COALESCE(v_client_profile.company_name, company_name),
        billing_address = COALESCE(v_billing_addr,   billing_address),
        notes           = COALESCE(v_notes,          notes),
        updated_at = now()
      WHERE id = v_provider_customer;
    END IF;

    -- Selected properties
    SELECT ARRAY(SELECT (jsonb_array_elements_text(COALESCE(t.payload->'property_ids','[]'::jsonb)))::uuid)
      INTO v_props;

    IF v_props IS NOT NULL AND array_length(v_props,1) > 0 THEN
      -- Re-tag properties owned by the client (any of their customer ids)
      UPDATE public.properties
        SET tenant_id = t.tenant_id,
            customer_id = v_provider_customer,
            updated_at = now()
      WHERE id = ANY(v_props)
        AND customer_id IN (
          SELECT id FROM public.customers
           WHERE id = v_client_profile.customer_id
              OR (lower(COALESCE(email,'')) = lower(COALESCE(v_client_profile.email,'')) AND tenant_id IS NULL)
        );

      -- Ensure inventory rows exist and are tenant-tagged for each moved property
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
          'customer', v_provider_customer, auth.uid()
        );
      END LOOP;
    END IF;

    -- Insert/refresh client_connections row (idempotent on (client_user_id, tenant_id))
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

    -- Notify provider admins so they immediately see the new customer
    FOR v_admin IN SELECT public._provider_admin_user_ids(t.tenant_id) LOOP
      PERFORM public._emit_notification(
        v_admin, t.tenant_id, 'connection_approved',
        'New customer connected',
        COALESCE(v_client_profile.full_name,'A client') ||
        ' shared ' || COALESCE(array_length(v_props,1),0)::text || ' property(ies)',
        'customer', v_provider_customer, NULL
      );
    END LOOP;

  ELSIF t.task_type = 'offer_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.offers SET status = 'ACCEPTED' WHERE id = t.subject_entity_id;
  ELSIF t.task_type = 'contract_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.contracts SET status = 'ACTIVE' WHERE id = t.subject_entity_id;
  END IF;
END
$function$;

-- 3) Index for property lookups by customer+tenant
CREATE INDEX IF NOT EXISTS idx_properties_customer_tenant ON public.properties (customer_id, tenant_id);

-- 4) Backfill existing Serene Garden ↔ Sonia connection so provider sees customer + property + inventory
DO $do$
DECLARE
  v_tenant uuid;
  v_client_user uuid;
  v_profile public.profiles%ROWTYPE;
  v_provider_customer uuid;
  v_old_customer uuid;
  v_billing text;
  v_notes text;
  v_prop record;
BEGIN
  -- Iterate over each APPROVED connection that hasn't been materialised on the provider side
  FOR v_tenant, v_client_user IN
    SELECT cc.tenant_id, cc.client_user_id
      FROM public.client_connections cc
     WHERE cc.status = 'APPROVED'
  LOOP
    SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_client_user;
    IF v_profile.user_id IS NULL THEN CONTINUE; END IF;

    v_old_customer := v_profile.customer_id;

    v_billing := NULLIF(trim(both ', ' FROM concat_ws(', ',
      NULLIF(trim(COALESCE(v_profile.address_street,'')),''),
      NULLIF(trim(COALESCE(v_profile.address_city,'')),''),
      NULLIF(trim(COALESCE(v_profile.address_county,'')),'')
    )),'');
    v_notes := NULLIF(trim(concat_ws(E'\n',
      CASE WHEN v_profile.cui   IS NOT NULL AND length(trim(v_profile.cui))>0   THEN 'CUI: '||v_profile.cui   END,
      CASE WHEN v_profile.vat_id IS NOT NULL AND length(trim(v_profile.vat_id))>0 THEN 'VAT: '||v_profile.vat_id END,
      CASE WHEN v_profile.cnp   IS NOT NULL AND length(trim(v_profile.cnp))>0   THEN 'CNP: '||v_profile.cnp   END,
      CASE WHEN v_profile.client_type IS NOT NULL THEN 'Client type: '||v_profile.client_type END
    )),'');

    -- Find/create provider-side customer
    v_provider_customer := NULL;
    IF v_profile.email IS NOT NULL THEN
      SELECT id INTO v_provider_customer
        FROM public.customers
       WHERE tenant_id = v_tenant
         AND lower(email) = lower(v_profile.email)
       LIMIT 1;
    END IF;

    IF v_provider_customer IS NULL THEN
      INSERT INTO public.customers (
        tenant_id, name, contact_person_name, email, phone,
        company_name, billing_address, notes, status
      ) VALUES (
        v_tenant,
        COALESCE(NULLIF(trim(v_profile.full_name),''), v_profile.email, 'Client'),
        v_profile.full_name, v_profile.email, v_profile.phone,
        v_profile.company_name, v_billing, v_notes, 'ACTIVE'
      ) RETURNING id INTO v_provider_customer;
    END IF;

    -- Re-tag any properties currently owned by the client's tenantless customer that point to this tenant
    -- (covers Sonia: property already has tenant_id but customer_id still points to her own customer row)
    FOR v_prop IN
      SELECT id FROM public.properties
       WHERE (tenant_id = v_tenant OR tenant_id IS NULL)
         AND customer_id = v_old_customer
    LOOP
      UPDATE public.properties
         SET tenant_id = v_tenant,
             customer_id = v_provider_customer,
             updated_at = now()
       WHERE id = v_prop.id;

      -- Ensure inventory exists and is tagged
      INSERT INTO public.inventory (property_id, tenant_id)
      SELECT v_prop.id, v_tenant
       WHERE NOT EXISTS (SELECT 1 FROM public.inventory WHERE property_id = v_prop.id);

      UPDATE public.inventory SET tenant_id = v_tenant, updated_at = now()
       WHERE property_id = v_prop.id;

      UPDATE public.inventory_items SET tenant_id = v_tenant, updated_at = now()
       WHERE inventory_id IN (SELECT id FROM public.inventory WHERE property_id = v_prop.id);
    END LOOP;
  END LOOP;
END
$do$;