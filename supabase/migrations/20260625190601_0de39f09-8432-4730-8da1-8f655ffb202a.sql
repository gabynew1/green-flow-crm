
-- 1. user_roles
DROP POLICY IF EXISTS "Provider admins can manage same-tenant roles" ON public.user_roles;

CREATE POLICY "Provider admins can insert staff roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND role = 'PROVIDER_STAFF'::app_role
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p1 JOIN profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid() AND p2.user_id = user_roles.user_id AND p1.tenant_id IS NOT NULL
  )
);

CREATE POLICY "Provider admins can update staff roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND role = 'PROVIDER_STAFF'::app_role
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p1 JOIN profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid() AND p2.user_id = user_roles.user_id AND p1.tenant_id IS NOT NULL
  )
)
WITH CHECK (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND role = 'PROVIDER_STAFF'::app_role
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p1 JOIN profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid() AND p2.user_id = user_roles.user_id AND p1.tenant_id IS NOT NULL
  )
);

CREATE POLICY "Provider admins can delete staff roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND role = 'PROVIDER_STAFF'::app_role
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles p1 JOIN profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid() AND p2.user_id = user_roles.user_id AND p1.tenant_id IS NOT NULL
  )
);

-- 2. email_send_log
DROP POLICY IF EXISTS "Tenant admins read own tenant send log" ON public.email_send_log;
COMMENT ON COLUMN public.email_send_log.template_data IS
  'Sensitive: may contain tokens, links, or PII. Readable only by service_role and super admins.';
COMMENT ON COLUMN public.email_send_log.recipient_email IS
  'PII: readable only by service_role and super admins.';

-- 3. contract_closure_events
COMMENT ON TABLE public.contract_closure_events IS
  'Write-only via service_role / SECURITY DEFINER server functions. Direct client INSERT/UPDATE/DELETE is intentionally blocked by RLS.';

CREATE POLICY "Service role manages closure events"
ON public.contract_closure_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- 4. provider_invites
REVOKE SELECT ON public.provider_invites FROM authenticated;
REVOKE SELECT ON public.provider_invites FROM anon;
GRANT SELECT (id, tenant_id, role, used_by, used_at, expires_at, created_at, created_by)
  ON public.provider_invites TO authenticated;

COMMENT ON COLUMN public.provider_invites.token IS
  'Sensitive invite secret. Readable only by service_role/super_admin; never expose to tenant users.';
COMMENT ON TABLE public.provider_invites IS
  'Invites are created and managed by super admins or edge functions running as service_role. Tenant users cannot read invite tokens.';
