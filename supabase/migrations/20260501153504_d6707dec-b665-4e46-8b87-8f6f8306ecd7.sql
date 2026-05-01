
-- =====================================================================
-- TASKS / PENDING ACTIONS + NOTIFICATIONS SYSTEM
-- =====================================================================

-- Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.action_task_status AS ENUM ('pending','approved','rejected','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.action_task_type AS ENUM (
    'link_request',
    'offer_response',
    'contract_response',
    'inspection_confirmation',
    'contract_renewal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.action_task_event_type AS ENUM (
    'created','approved','rejected','cancelled','expired','commented','auto_approved'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_kind AS ENUM (
    'task_created','task_approved','task_rejected','task_commented','task_expired',
    'inspection_scheduled','inspection_completed',
    'offer_sent','offer_accepted','offer_rejected',
    'contract_sent','contract_signed','contract_rejected',
    'contract_expiring_soon','contract_renewed',
    'feedback_received',
    'connection_approved','connection_revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  task_type public.action_task_type NOT NULL,
  status public.action_task_status NOT NULL DEFAULT 'pending',
  initiator_user_id uuid NOT NULL,
  initiator_role text,
  target_user_id uuid,
  target_role text,
  subject_entity_type text,
  subject_entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_tasks_tenant_status ON public.action_tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_action_tasks_target ON public.action_tasks (tenant_id, target_user_id, status);
CREATE INDEX IF NOT EXISTS idx_action_tasks_initiator ON public.action_tasks (tenant_id, initiator_user_id);
CREATE INDEX IF NOT EXISTS idx_action_tasks_subject ON public.action_tasks (subject_entity_type, subject_entity_id);

CREATE TABLE IF NOT EXISTS public.action_task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.action_tasks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  actor_user_id uuid,
  event_type public.action_task_event_type NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_task_events_task ON public.action_task_events (task_id, created_at);

CREATE TABLE IF NOT EXISTS public.action_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.action_tasks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_task_comments_task ON public.action_task_comments (task_id, created_at);

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  user_id uuid NOT NULL,
  kind public.notification_kind NOT NULL,
  title text NOT NULL,
  body text,
  entity_type text,
  entity_id uuid,
  task_id uuid REFERENCES public.action_tasks(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notifications_task ON public.user_notifications (task_id);

CREATE TABLE IF NOT EXISTS public.notification_dedupe (
  dedupe_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_action_tasks_updated_at ON public.action_tasks;
CREATE TRIGGER trg_action_tasks_updated_at
BEFORE UPDATE ON public.action_tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.action_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_task_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dedupe  ENABLE ROW LEVEL SECURITY;

-- action_tasks: SELECT for participants in tenant
DROP POLICY IF EXISTS "Participants can view action tasks" ON public.action_tasks;
CREATE POLICY "Participants can view action tasks"
ON public.action_tasks FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR initiator_user_id = auth.uid()
  OR target_user_id = auth.uid()
  OR (
    target_user_id IS NULL
    AND public.is_provider(auth.uid())
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

-- No direct INSERT/UPDATE/DELETE — only via SECURITY DEFINER RPCs.

-- action_task_events: SELECT only for users who can see the parent task
DROP POLICY IF EXISTS "Participants can view task events" ON public.action_task_events;
CREATE POLICY "Participants can view task events"
ON public.action_task_events FOR SELECT TO authenticated
USING (
  task_id IN (SELECT id FROM public.action_tasks)
);

-- action_task_comments: SELECT visible if parent task visible; INSERT via RPC only
DROP POLICY IF EXISTS "Participants can view task comments" ON public.action_task_comments;
CREATE POLICY "Participants can view task comments"
ON public.action_task_comments FOR SELECT TO authenticated
USING (
  task_id IN (SELECT id FROM public.action_tasks)
);

-- user_notifications: owner can read & mark read
DROP POLICY IF EXISTS "Users can view their notifications" ON public.user_notifications;
CREATE POLICY "Users can view their notifications"
ON public.user_notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their notifications" ON public.user_notifications;
CREATE POLICY "Users can update their notifications"
ON public.user_notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- notification_dedupe: service-only
DROP POLICY IF EXISTS "Service role manages dedupe" ON public.notification_dedupe;
CREATE POLICY "Service role manages dedupe"
ON public.notification_dedupe FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =====================================================================
-- HELPER: emit notification
-- =====================================================================
CREATE OR REPLACE FUNCTION public._emit_notification(
  _user_id uuid,
  _tenant_id uuid,
  _kind public.notification_kind,
  _title text,
  _body text,
  _entity_type text,
  _entity_id uuid,
  _task_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.user_notifications (user_id, tenant_id, kind, title, body, entity_type, entity_id, task_id)
  VALUES (_user_id, _tenant_id, _kind, _title, _body, _entity_type, _entity_id, _task_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Helper: list provider admin user_ids for a tenant
CREATE OR REPLACE FUNCTION public._provider_admin_user_ids(_tenant_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.user_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.tenant_id = _tenant_id
    AND ur.role = 'PROVIDER_ADMIN'
$$;

-- Helper: client user_id for a customer
CREATE OR REPLACE FUNCTION public._client_user_id_for_customer(_customer_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id FROM public.profiles WHERE customer_id = _customer_id LIMIT 1
$$;

-- =====================================================================
-- RPC: create_action_task
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_action_task(
  _task_type public.action_task_type,
  _tenant_id uuid,
  _target_user_id uuid,
  _target_role text,
  _subject_entity_type text,
  _subject_entity_id uuid,
  _payload jsonb,
  _due_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
  v_initiator_role text;
  v_auto_approve boolean := false;
  v_flags jsonb;
  v_target uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  SELECT string_agg(role::text, ',') INTO v_initiator_role
  FROM public.user_roles WHERE user_id = auth.uid();

  INSERT INTO public.action_tasks (
    tenant_id, task_type, status, initiator_user_id, initiator_role,
    target_user_id, target_role, subject_entity_type, subject_entity_id,
    payload, due_at
  ) VALUES (
    _tenant_id, _task_type, 'pending', auth.uid(), COALESCE(v_initiator_role,'unknown'),
    _target_user_id, _target_role, _subject_entity_type, _subject_entity_id,
    COALESCE(_payload,'{}'::jsonb), _due_at
  ) RETURNING id INTO v_task_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (v_task_id, _tenant_id, auth.uid(), 'created', jsonb_build_object('task_type', _task_type));

  -- Notify target(s)
  IF _target_user_id IS NOT NULL THEN
    PERFORM public._emit_notification(
      _target_user_id, _tenant_id, 'task_created',
      'New action required',
      _task_type::text || ' awaiting your response',
      'action_task', v_task_id, v_task_id
    );
  ELSE
    -- Notify all provider admins in tenant
    FOR v_target IN SELECT public._provider_admin_user_ids(_tenant_id) LOOP
      PERFORM public._emit_notification(
        v_target, _tenant_id, 'task_created',
        'New action required',
        _task_type::text || ' awaiting your response',
        'action_task', v_task_id, v_task_id
      );
    END LOOP;
  END IF;

  -- Auto-approve check (link_request only for now)
  IF _task_type = 'link_request' THEN
    SELECT feature_flags INTO v_flags FROM public.tenants WHERE id = _tenant_id;
    IF COALESCE((v_flags->>'auto_approve_link_requests')::boolean, false) THEN
      v_auto_approve := true;
    END IF;
  END IF;

  IF v_auto_approve THEN
    PERFORM public._apply_task_side_effects(v_task_id, 'approve');
    UPDATE public.action_tasks SET status = 'approved', updated_at = now() WHERE id = v_task_id;
    INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
    VALUES (v_task_id, _tenant_id, NULL, 'auto_approved', '{}'::jsonb);
    PERFORM public._emit_notification(
      auth.uid(), _tenant_id, 'task_approved',
      'Request auto-approved',
      'Your ' || _task_type::text || ' was automatically approved',
      'action_task', v_task_id, v_task_id
    );
  END IF;

  RETURN v_task_id;
END $$;

-- =====================================================================
-- Side effects per task_type (extracted for reuse by auto-approve)
-- =====================================================================
CREATE OR REPLACE FUNCTION public._apply_task_side_effects(
  _task_id uuid,
  _action text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.action_tasks%ROWTYPE;
  v_property_id uuid;
  v_props uuid[];
BEGIN
  SELECT * INTO t FROM public.action_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF _action <> 'approve' THEN
    -- Reject side effects
    IF t.task_type = 'offer_response' AND t.subject_entity_id IS NOT NULL THEN
      UPDATE public.offers SET status = 'REJECTED' WHERE id = t.subject_entity_id;
    ELSIF t.task_type = 'contract_response' AND t.subject_entity_id IS NOT NULL THEN
      UPDATE public.contracts SET status = 'REJECTED' WHERE id = t.subject_entity_id;
    END IF;
    RETURN;
  END IF;

  -- Approve side effects
  IF t.task_type = 'link_request' THEN
    -- payload: { property_ids: [uuid], provider_tenant_id: uuid, provider_name: text }
    SELECT ARRAY(SELECT jsonb_array_elements_text(t.payload->'property_ids'))::uuid[] INTO v_props;
    IF array_length(v_props,1) > 0 THEN
      UPDATE public.properties
        SET tenant_id = t.tenant_id
        WHERE id = ANY(v_props) AND customer_id = public.get_user_customer_id(t.initiator_user_id);
    END IF;
    INSERT INTO public.client_connections (
      client_user_id, tenant_id, status, requested_by, provider_name, responded_at
    ) VALUES (
      t.initiator_user_id, t.tenant_id, 'APPROVED', t.initiator_user_id,
      t.payload->>'provider_name', now()
    ) ON CONFLICT DO NOTHING;
  ELSIF t.task_type = 'offer_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.offers SET status = 'ACCEPTED' WHERE id = t.subject_entity_id;
  ELSIF t.task_type = 'contract_response' AND t.subject_entity_id IS NOT NULL THEN
    UPDATE public.contracts SET status = 'ACTIVE' WHERE id = t.subject_entity_id;
  END IF;
END $$;

-- =====================================================================
-- RPC: act_on_task
-- =====================================================================
CREATE OR REPLACE FUNCTION public.act_on_task(
  _task_id uuid,
  _action text,
  _comment text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  -- RBAC
  IF _action = 'cancel' THEN
    v_can := (auth.uid() = t.initiator_user_id);
  ELSE -- approve | reject
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

  -- Apply downstream side effects first (so failures abort the status change)
  PERFORM public._apply_task_side_effects(_task_id, _action);

  UPDATE public.action_tasks SET status = v_new_status, updated_at = now() WHERE id = _task_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (_task_id, t.tenant_id, auth.uid(), v_event_type, jsonb_build_object('comment', _comment));

  IF _comment IS NOT NULL AND length(trim(_comment)) > 0 THEN
    INSERT INTO public.action_task_comments (task_id, tenant_id, author_user_id, body)
    VALUES (_task_id, t.tenant_id, auth.uid(), _comment);
  END IF;

  -- Notify the initiator
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
END $$;

-- =====================================================================
-- RPC: add_task_comment
-- =====================================================================
CREATE OR REPLACE FUNCTION public.add_task_comment(
  _task_id uuid, _body text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t public.action_tasks%ROWTYPE;
  v_id uuid;
  v_other uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 THEN RAISE EXCEPTION 'Comment body required'; END IF;
  SELECT * INTO t FROM public.action_tasks WHERE id = _task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF auth.uid() NOT IN (t.initiator_user_id, t.target_user_id)
     AND NOT (t.target_user_id IS NULL
              AND public.is_provider(auth.uid())
              AND public.get_user_tenant_id(auth.uid()) = t.tenant_id) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;

  INSERT INTO public.action_task_comments (task_id, tenant_id, author_user_id, body)
  VALUES (_task_id, t.tenant_id, auth.uid(), _body) RETURNING id INTO v_id;

  INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
  VALUES (_task_id, t.tenant_id, auth.uid(), 'commented', jsonb_build_object('comment_id', v_id));

  v_other := CASE WHEN auth.uid() = t.initiator_user_id THEN t.target_user_id ELSE t.initiator_user_id END;
  IF v_other IS NOT NULL THEN
    PERFORM public._emit_notification(v_other, t.tenant_id, 'task_commented',
      'New comment on task', _body, 'action_task', _task_id, _task_id);
  END IF;
  RETURN v_id;
END $$;

-- =====================================================================
-- RPCs: notifications read state
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.user_notifications
    SET read_at = now()
    WHERE user_id = auth.uid() AND id = ANY(_ids) AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.user_notifications SET read_at = now()
    WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- =====================================================================
-- LIFECYCLE TRIGGERS — informational notifications + auto tasks
-- =====================================================================

-- Offers
CREATE OR REPLACE FUNCTION public._trg_offers_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_client_user uuid;
  v_task uuid;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'SENT_TO_CLIENT')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'SENT_TO_CLIENT' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    v_client_user := public._client_user_id_for_customer(NEW.customer_id);
    PERFORM public._emit_notification(v_client_user, NEW.tenant_id, 'offer_sent',
      'New offer received', COALESCE(NEW.offer_name,'Offer'), 'offer', NEW.id, NULL);
    -- Create action task for client
    IF v_client_user IS NOT NULL THEN
      INSERT INTO public.action_tasks (tenant_id, task_type, initiator_user_id, initiator_role,
        target_user_id, target_role, subject_entity_type, subject_entity_id, payload, due_at)
      VALUES (NEW.tenant_id, 'offer_response', NEW.created_by, 'PROVIDER',
        v_client_user, 'CLIENT_USER', 'offer', NEW.id,
        jsonb_build_object('offer_name', NEW.offer_name, 'total_value', NEW.total_value),
        NEW.valid_until::timestamptz)
      RETURNING id INTO v_task;
      INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
      VALUES (v_task, NEW.tenant_id, NEW.created_by, 'created', '{}'::jsonb);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IN ('ACCEPTED','REJECTED') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public._emit_notification(NEW.created_by, NEW.tenant_id,
      CASE NEW.status WHEN 'ACCEPTED' THEN 'offer_accepted'::public.notification_kind ELSE 'offer_rejected'::public.notification_kind END,
      'Offer ' || lower(NEW.status::text), COALESCE(NEW.offer_name,'Offer'), 'offer', NEW.id, NULL);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_offers_notify ON public.offers;
CREATE TRIGGER trg_offers_notify
AFTER INSERT OR UPDATE OF status ON public.offers
FOR EACH ROW EXECUTE FUNCTION public._trg_offers_notify();

-- Contracts
CREATE OR REPLACE FUNCTION public._trg_contracts_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_client_user uuid;
  v_task uuid;
  v_admin uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.properties WHERE id = NEW.property_id;
  v_client_user := public._client_user_id_for_customer(v_customer);

  IF (TG_OP = 'INSERT' AND NEW.status = 'SENT_TO_CLIENT')
     OR (TG_OP = 'UPDATE' AND NEW.status = 'SENT_TO_CLIENT' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public._emit_notification(v_client_user, NEW.tenant_id, 'contract_sent',
      'New contract received', COALESCE(NEW.contract_name,'Contract'), 'contract', NEW.id, NULL);
    IF v_client_user IS NOT NULL THEN
      INSERT INTO public.action_tasks (tenant_id, task_type, initiator_user_id, initiator_role,
        target_user_id, target_role, subject_entity_type, subject_entity_id, payload, due_at)
      VALUES (NEW.tenant_id, 'contract_response', auth.uid(), 'PROVIDER',
        v_client_user, 'CLIENT_USER', 'contract', NEW.id,
        jsonb_build_object('contract_name', NEW.contract_name), NEW.start_date::timestamptz)
      RETURNING id INTO v_task;
      INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
      VALUES (v_task, NEW.tenant_id, auth.uid(), 'created', '{}'::jsonb);
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('ACTIVE','SIGNED') THEN
      PERFORM public._emit_notification(v_client_user, NEW.tenant_id, 'contract_signed',
        'Contract active', COALESCE(NEW.contract_name,'Contract'), 'contract', NEW.id, NULL);
      FOR v_admin IN SELECT public._provider_admin_user_ids(NEW.tenant_id) LOOP
        PERFORM public._emit_notification(v_admin, NEW.tenant_id, 'contract_signed',
          'Contract active', COALESCE(NEW.contract_name,'Contract'), 'contract', NEW.id, NULL);
      END LOOP;
    ELSIF NEW.status = 'REJECTED' THEN
      FOR v_admin IN SELECT public._provider_admin_user_ids(NEW.tenant_id) LOOP
        PERFORM public._emit_notification(v_admin, NEW.tenant_id, 'contract_rejected',
          'Contract rejected', COALESCE(NEW.rejection_comment, NEW.contract_name), 'contract', NEW.id, NULL);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_contracts_notify ON public.contracts;
CREATE TRIGGER trg_contracts_notify
AFTER INSERT OR UPDATE OF status ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public._trg_contracts_notify();

-- Inspections
CREATE OR REPLACE FUNCTION public._trg_inspections_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_client_user uuid;
BEGIN
  v_client_user := public._client_user_id_for_customer(NEW.customer_id);
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'SCHEDULED' THEN
      PERFORM public._emit_notification(v_client_user, NEW.tenant_id, 'inspection_scheduled',
        'Inspection scheduled', COALESCE(NEW.title,'Inspection') ||
        CASE WHEN NEW.inspected_date IS NOT NULL THEN ' on ' || NEW.inspected_date::text ELSE '' END,
        'inspection', NEW.id, NULL);
    ELSIF NEW.status = 'COMPLETED' THEN
      PERFORM public._emit_notification(v_client_user, NEW.tenant_id, 'inspection_completed',
        'Inspection completed', COALESCE(NEW.title,'Inspection'), 'inspection', NEW.id, NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inspections_notify ON public.inspections;
CREATE TRIGGER trg_inspections_notify
AFTER UPDATE OF status ON public.inspections
FOR EACH ROW EXECUTE FUNCTION public._trg_inspections_notify();

-- Feedback
CREATE OR REPLACE FUNCTION public._trg_feedback_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin uuid;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
  FOR v_admin IN SELECT public._provider_admin_user_ids(NEW.tenant_id) LOOP
    PERFORM public._emit_notification(v_admin, NEW.tenant_id, 'feedback_received',
      'New feedback received',
      COALESCE(NEW.rating_stars::text || '★ ' || COALESCE(NEW.comment,''), 'New feedback'),
      'feedback', NEW.id, NULL);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_feedback_notify ON public.feedback;
CREATE TRIGGER trg_feedback_notify
AFTER INSERT ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public._trg_feedback_notify();

-- Connections
CREATE OR REPLACE FUNCTION public._trg_connections_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_admin uuid; v_kind public.notification_kind;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'APPROVED' THEN v_kind := 'connection_approved';
    ELSIF NEW.status = 'REVOKED' THEN v_kind := 'connection_revoked';
    ELSE RETURN NEW; END IF;
    PERFORM public._emit_notification(NEW.client_user_id, NEW.tenant_id, v_kind,
      'Connection ' || lower(NEW.status::text),
      COALESCE(NEW.provider_name,'Provider'), 'client_connection', NEW.id, NULL);
    FOR v_admin IN SELECT public._provider_admin_user_ids(NEW.tenant_id) LOOP
      PERFORM public._emit_notification(v_admin, NEW.tenant_id, v_kind,
        'Connection ' || lower(NEW.status::text),
        'Client connection updated', 'client_connection', NEW.id, NULL);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_connections_notify ON public.client_connections;
CREATE TRIGGER trg_connections_notify
AFTER UPDATE OF status ON public.client_connections
FOR EACH ROW EXECUTE FUNCTION public._trg_connections_notify();

-- =====================================================================
-- Scheduled jobs
-- =====================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_action_tasks() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT id, tenant_id, initiator_user_id, task_type
    FROM public.action_tasks
    WHERE status = 'pending' AND due_at IS NOT NULL AND due_at < now()
  LOOP
    UPDATE public.action_tasks SET status='expired', updated_at=now() WHERE id = r.id;
    INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
    VALUES (r.id, r.tenant_id, NULL, 'expired', '{}'::jsonb);
    PERFORM public._emit_notification(r.initiator_user_id, r.tenant_id, 'task_expired',
      'Request expired', r.task_type::text || ' has expired', 'action_task', r.id, r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.notify_contract_renewals() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c record; v_admin uuid; v_days int; v_dedupe text; v_task uuid; n int := 0;
BEGIN
  FOR c IN
    SELECT * FROM public.contracts
    WHERE archived = false AND end_date IS NOT NULL
      AND end_date BETWEEN current_date AND current_date + INTERVAL '30 days'
      AND status IN ('ACTIVE','SIGNED')
  LOOP
    v_days := (c.end_date - current_date);
    IF v_days NOT IN (30,14,7) THEN CONTINUE; END IF;
    v_dedupe := 'contract_renewal:' || c.id::text || ':' || v_days::text;
    BEGIN
      INSERT INTO public.notification_dedupe (dedupe_key) VALUES (v_dedupe);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
    FOR v_admin IN SELECT public._provider_admin_user_ids(c.tenant_id) LOOP
      PERFORM public._emit_notification(v_admin, c.tenant_id, 'contract_expiring_soon',
        'Contract expiring in ' || v_days || ' days',
        COALESCE(c.contract_name,'Contract') || ' ends ' || c.end_date::text,
        'contract', c.id, NULL);
    END LOOP;
    -- At 14 days, also create a renewal action task
    IF v_days = 14 THEN
      INSERT INTO public.action_tasks (tenant_id, task_type, initiator_user_id, initiator_role,
        target_user_id, target_role, subject_entity_type, subject_entity_id, payload, due_at)
      VALUES (c.tenant_id, 'contract_renewal', c.tenant_id /*system*/, 'SYSTEM',
        NULL, 'PROVIDER_ADMIN', 'contract', c.id,
        jsonb_build_object('contract_name', c.contract_name, 'end_date', c.end_date),
        c.end_date::timestamptz)
      RETURNING id INTO v_task;
      INSERT INTO public.action_task_events (task_id, tenant_id, actor_user_id, event_type, meta)
      VALUES (v_task, c.tenant_id, NULL, 'created', jsonb_build_object('source','cron'));
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- =====================================================================
-- Realtime publication
-- =====================================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.action_tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.user_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.action_tasks REPLICA IDENTITY FULL;

-- pg_cron schedules
DO $$ BEGIN
  PERFORM cron.unschedule('expire-stale-action-tasks');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('notify-contract-renewals');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('expire-stale-action-tasks','15 1 * * *',$$SELECT public.expire_stale_action_tasks();$$);
SELECT cron.schedule('notify-contract-renewals','30 1 * * *',$$SELECT public.notify_contract_renewals();$$);
