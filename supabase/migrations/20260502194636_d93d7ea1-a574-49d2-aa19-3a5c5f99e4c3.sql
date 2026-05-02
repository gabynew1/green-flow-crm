DROP POLICY IF EXISTS "Participants can view task comments" ON public.action_task_comments;
CREATE POLICY "Participants can view task comments"
ON public.action_task_comments
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.action_tasks t
    WHERE t.id = action_task_comments.task_id
      AND (
        t.tenant_id = public.get_user_tenant_id(auth.uid())
        OR t.initiator_user_id = auth.uid()
        OR t.target_user_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "Participants can view task events" ON public.action_task_events;
CREATE POLICY "Participants can view task events"
ON public.action_task_events
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.action_tasks t
    WHERE t.id = action_task_events.task_id
      AND (
        t.tenant_id = public.get_user_tenant_id(auth.uid())
        OR t.initiator_user_id = auth.uid()
        OR t.target_user_id = auth.uid()
      )
  )
);