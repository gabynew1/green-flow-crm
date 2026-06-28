
-- 1. touch_updated_at: pin search_path
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

-- 2. profiles.temporary_password column-level lockdown
REVOKE SELECT (temporary_password) ON public.profiles FROM authenticated;
REVOKE SELECT (temporary_password) ON public.profiles FROM anon;
-- service_role retains full access via GRANT ALL

-- 3. provider_invites: hide token column from authenticated, add tenant-scoped policies
REVOKE SELECT (token) ON public.provider_invites FROM authenticated;
REVOKE SELECT (token) ON public.provider_invites FROM anon;

-- Tenant admins may view their own tenant's invite metadata (excluding token)
DROP POLICY IF EXISTS "Provider admins can view tenant invites" ON public.provider_invites;
CREATE POLICY "Provider admins can view tenant invites"
ON public.provider_invites
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'PROVIDER_ADMIN'::public.app_role)
);

-- Tenant admins may revoke (delete) their own tenant's unused invites
DROP POLICY IF EXISTS "Provider admins can revoke tenant invites" ON public.provider_invites;
CREATE POLICY "Provider admins can revoke tenant invites"
ON public.provider_invites
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'PROVIDER_ADMIN'::public.app_role)
  AND used_by IS NULL
);
