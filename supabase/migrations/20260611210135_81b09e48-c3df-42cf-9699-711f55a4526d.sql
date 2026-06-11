
-- ============================================================
-- Phase 2: hard-delete RPCs + reactivation helper
-- ============================================================

-- Hard delete a tenant and ALL its data (child → parent order).
CREATE OR REPLACE FUNCTION public.hard_delete_tenant(_tenant_id uuid, _reason text DEFAULT 'lifecycle_expired', _triggered_by text DEFAULT 'cron')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counts  jsonb := '{}'::jsonb;
  n       bigint;
  uids    uuid[];
  tname   text;
BEGIN
  SELECT name INTO tname FROM public.tenants WHERE id = _tenant_id;
  IF tname IS NULL THEN
    RAISE EXCEPTION 'tenant % not found', _tenant_id;
  END IF;

  -- Gather provider users to remove from auth + user_roles afterwards.
  SELECT coalesce(array_agg(user_id), ARRAY[]::uuid[]) INTO uids
  FROM public.profiles
  WHERE tenant_id = _tenant_id AND user_id IS NOT NULL;

  -- Helper macro via repetition: delete from a table where tenant_id matches.
  DELETE FROM public.action_task_comments WHERE task_id IN (SELECT id FROM public.action_tasks WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('action_task_comments', n);

  DELETE FROM public.action_task_events WHERE task_id IN (SELECT id FROM public.action_tasks WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('action_task_events', n);

  DELETE FROM public.action_tasks WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('action_tasks', n);

  DELETE FROM public.contract_line_items WHERE contract_id IN (SELECT id FROM public.contracts WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('contract_line_items', n);

  DELETE FROM public.contract_closure_events WHERE contract_id IN (SELECT id FROM public.contracts WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('contract_closure_events', n);

  DELETE FROM public.contracts WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('contracts', n);

  DELETE FROM public.offer_line_items WHERE offer_id IN (SELECT id FROM public.offers WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('offer_line_items', n);

  DELETE FROM public.offers WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('offers', n);

  DELETE FROM public.service_order_items WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('service_order_items', n);

  DELETE FROM public.service_orders WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('service_orders', n);

  DELETE FROM public.inspections WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inspections', n);

  DELETE FROM public.feedback WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('feedback', n);

  DELETE FROM public.inventory_items WHERE inventory_id IN (SELECT id FROM public.inventory WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inventory_items', n);

  DELETE FROM public.inventory WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inventory', n);

  DELETE FROM public.properties WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('properties', n);

  DELETE FROM public.client_connections WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('client_connections', n);

  DELETE FROM public.tasks WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tasks', n);

  DELETE FROM public.activity_log WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('activity_log', n);

  DELETE FROM public.team_members WHERE team_id IN (SELECT id FROM public.teams WHERE tenant_id = _tenant_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('team_members', n);

  DELETE FROM public.teams WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('teams', n);

  DELETE FROM public.tenant_email_settings WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tenant_email_settings', n);

  DELETE FROM public.tenant_non_workdays WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tenant_non_workdays', n);

  DELETE FROM public.trial_extensions WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('trial_extensions', n);

  DELETE FROM public.provider_invites WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('provider_invites', n);

  DELETE FROM public.customers WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('customers', n);

  -- User-scoped cleanup for provider users
  DELETE FROM public.user_roles WHERE user_id = ANY(uids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_roles', n);

  DELETE FROM public.user_email_preferences WHERE user_id = ANY(uids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_email_preferences', n);

  DELETE FROM public.user_notifications WHERE user_id = ANY(uids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_notifications', n);

  DELETE FROM public.profiles WHERE tenant_id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('profiles', n);

  DELETE FROM public.tenants WHERE id = _tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tenants', n);

  -- Finally remove provider users from auth.
  IF array_length(uids,1) > 0 THEN
    DELETE FROM auth.users WHERE id = ANY(uids);
    counts := counts || jsonb_build_object('auth_users', array_length(uids,1));
  ELSE
    counts := counts || jsonb_build_object('auth_users', 0);
  END IF;

  INSERT INTO public.lifecycle_deletion_audit (subject_kind, subject_id, subject_name, reason, row_counts, triggered_by)
  VALUES ('tenant', _tenant_id, tname, _reason, counts, _triggered_by);

  RETURN counts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_delete_tenant(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hard_delete_tenant(uuid, text, text) TO service_role;

-- Hard delete a single customer (client account).
CREATE OR REPLACE FUNCTION public.hard_delete_customer(_customer_id uuid, _reason text DEFAULT 'lifecycle_expired', _triggered_by text DEFAULT 'cron')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counts jsonb := '{}'::jsonb;
  n bigint;
  uids uuid[];
  cname text;
BEGIN
  SELECT name INTO cname FROM public.customers WHERE id = _customer_id;
  IF cname IS NULL THEN
    RAISE EXCEPTION 'customer % not found', _customer_id;
  END IF;

  SELECT coalesce(array_agg(user_id), ARRAY[]::uuid[]) INTO uids
  FROM public.profiles
  WHERE customer_id = _customer_id AND user_id IS NOT NULL;

  DELETE FROM public.contract_line_items WHERE contract_id IN (SELECT id FROM public.contracts WHERE customer_id = _customer_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('contract_line_items', n);

  DELETE FROM public.contract_closure_events WHERE contract_id IN (SELECT id FROM public.contracts WHERE customer_id = _customer_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('contract_closure_events', n);

  DELETE FROM public.contracts WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('contracts', n);

  DELETE FROM public.offer_line_items WHERE offer_id IN (SELECT id FROM public.offers WHERE customer_id = _customer_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('offer_line_items', n);

  DELETE FROM public.offers WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('offers', n);

  DELETE FROM public.service_order_items WHERE service_order_id IN (SELECT id FROM public.service_orders WHERE customer_id = _customer_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('service_order_items', n);

  DELETE FROM public.service_orders WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('service_orders', n);

  DELETE FROM public.inspections WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inspections', n);

  DELETE FROM public.feedback WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('feedback', n);

  DELETE FROM public.inventory_items WHERE inventory_id IN (SELECT id FROM public.inventory WHERE property_id IN (SELECT id FROM public.properties WHERE customer_id = _customer_id));
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inventory_items', n);

  DELETE FROM public.inventory WHERE property_id IN (SELECT id FROM public.properties WHERE customer_id = _customer_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inventory', n);

  DELETE FROM public.properties WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('properties', n);

  DELETE FROM public.client_connections WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('client_connections', n);

  DELETE FROM public.user_roles WHERE user_id = ANY(uids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_roles', n);

  DELETE FROM public.user_email_preferences WHERE user_id = ANY(uids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_email_preferences', n);

  DELETE FROM public.user_notifications WHERE user_id = ANY(uids);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_notifications', n);

  DELETE FROM public.profiles WHERE customer_id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('profiles', n);

  DELETE FROM public.customers WHERE id = _customer_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('customers', n);

  IF array_length(uids,1) > 0 THEN
    DELETE FROM auth.users WHERE id = ANY(uids);
    counts := counts || jsonb_build_object('auth_users', array_length(uids,1));
  ELSE
    counts := counts || jsonb_build_object('auth_users', 0);
  END IF;

  INSERT INTO public.lifecycle_deletion_audit (subject_kind, subject_id, subject_name, reason, row_counts, triggered_by)
  VALUES ('client', _customer_id, cname, _reason, counts, _triggered_by);

  RETURN counts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hard_delete_customer(uuid, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.hard_delete_customer(uuid, text, text) TO service_role;

-- ============================================================
-- Lifecycle state transition helpers (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_tenant_admin_login(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
  prev_status text;
  is_admin boolean;
BEGIN
  SELECT tenant_id INTO tid FROM public.profiles WHERE user_id = _user_id;
  IF tid IS NULL THEN RETURN jsonb_build_object('skipped','no_tenant'); END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'PROVIDER_ADMIN'
  ) INTO is_admin;
  IF NOT is_admin THEN RETURN jsonb_build_object('skipped','not_admin'); END IF;

  SELECT status INTO prev_status FROM public.tenants WHERE id = tid;

  UPDATE public.tenants
  SET last_admin_login_at = now(),
      status = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                    THEN 'active' ELSE status END,
      locked_at = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE locked_at END,
      locked_reason = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE locked_reason END,
      locked_by = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE locked_by END,
      flagged_for_deletion_at = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE flagged_for_deletion_at END,
      scheduled_delete_at = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE scheduled_delete_at END
  WHERE id = tid;

  RETURN jsonb_build_object(
    'tenant_id', tid,
    'previous_status', prev_status,
    'reactivated', prev_status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_customer_client_login(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
  prev_status text;
  is_client boolean;
BEGIN
  SELECT customer_id INTO cid FROM public.profiles WHERE user_id = _user_id;
  IF cid IS NULL THEN RETURN jsonb_build_object('skipped','no_customer'); END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'CLIENT_USER'
  ) INTO is_client;
  IF NOT is_client THEN RETURN jsonb_build_object('skipped','not_client'); END IF;

  SELECT status INTO prev_status FROM public.customers WHERE id = cid;

  UPDATE public.customers
  SET last_client_login_at = now(),
      status = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                    THEN 'ACTIVE' ELSE status END,
      locked_at = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE locked_at END,
      locked_reason = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE locked_reason END,
      locked_by = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE locked_by END,
      flagged_for_deletion_at = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE flagged_for_deletion_at END,
      scheduled_delete_at = CASE WHEN status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
                       THEN NULL ELSE scheduled_delete_at END
  WHERE id = cid;

  RETURN jsonb_build_object(
    'customer_id', cid,
    'previous_status', prev_status,
    'reactivated', prev_status IN ('inactivity_warned','soft_locked','flagged_for_deletion')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_tenant_admin_login(uuid)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.touch_tenant_admin_login(uuid)  TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.touch_customer_client_login(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.touch_customer_client_login(uuid) TO authenticated, service_role;
