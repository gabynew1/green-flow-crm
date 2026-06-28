
DROP POLICY IF EXISTS "Participants can view action tasks" ON public.action_tasks;
CREATE POLICY "Participants can view action tasks"
ON public.action_tasks
FOR SELECT
TO authenticated
USING (
  initiator_user_id = auth.uid()
  OR target_user_id = auth.uid()
  OR (
    public.is_provider(auth.uid())
    AND NOT public.has_role(auth.uid(), 'CLIENT_USER'::public.app_role)
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
);

REVOKE ALL ON public.provider_invites FROM anon, authenticated;
GRANT SELECT (id, tenant_id, role, used_by, used_at, expires_at, created_at, created_by)
  ON public.provider_invites TO authenticated;
GRANT ALL ON public.provider_invites TO service_role;
