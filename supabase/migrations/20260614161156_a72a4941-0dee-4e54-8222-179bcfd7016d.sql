
-- 1. action_tasks: restrict tenant-wide SELECT branch to providers
DROP POLICY IF EXISTS "Participants can view action tasks" ON public.action_tasks;
CREATE POLICY "Participants can view action tasks"
ON public.action_tasks
FOR SELECT
USING (
  (is_provider(auth.uid()) AND tenant_id = get_user_tenant_id(auth.uid()))
  OR initiator_user_id = auth.uid()
  OR target_user_id = auth.uid()
);

-- 2. global_holidays: super-admin-only writes
DROP POLICY IF EXISTS "Provider admins can manage holidays" ON public.global_holidays;

-- 3. user_roles: prevent privilege escalation by PROVIDER_ADMIN
DROP POLICY IF EXISTS "Provider admins can manage same-tenant roles" ON public.user_roles;
CREATE POLICY "Provider admins can manage same-tenant roles"
ON public.user_roles
FOR ALL
USING (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND EXISTS (
    SELECT 1
    FROM profiles p1
    JOIN profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = user_roles.user_id
      AND p1.tenant_id IS NOT NULL
  )
)
WITH CHECK (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND role = 'PROVIDER_STAFF'::app_role
  AND EXISTS (
    SELECT 1
    FROM profiles p1
    JOIN profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = user_roles.user_id
      AND p1.tenant_id IS NOT NULL
  )
);

-- 4. profiles.temporary_password: hide value, expose only a boolean flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_pending boolean NOT NULL DEFAULT false;

UPDATE public.profiles
   SET password_reset_pending = (temporary_password IS NOT NULL);

CREATE OR REPLACE FUNCTION public.sync_password_reset_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.password_reset_pending := NEW.temporary_password IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_password_reset_pending ON public.profiles;
CREATE TRIGGER trg_sync_password_reset_pending
BEFORE INSERT OR UPDATE OF temporary_password ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_password_reset_pending();

REVOKE SELECT (temporary_password) ON public.profiles FROM anon, authenticated;
GRANT  SELECT (temporary_password) ON public.profiles TO service_role;
