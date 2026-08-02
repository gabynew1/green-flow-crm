-- 1. security_alerts: enforce super-admin on writes too (previously no WITH CHECK)
DROP POLICY IF EXISTS "Super admins can manage security alerts" ON public.security_alerts;
CREATE POLICY "Super admins can manage security alerts"
ON public.security_alerts
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.security_alerts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_alerts TO authenticated;
GRANT ALL ON public.security_alerts TO service_role;

-- 2. user_email_preferences: bind rows to the authenticated identity, not a free-text email string
CREATE OR REPLACE FUNCTION public.current_auth_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(u.email) FROM auth.users u WHERE u.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_auth_email() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_auth_email() TO authenticated;

DROP POLICY IF EXISTS "Users view own email preferences" ON public.user_email_preferences;
DROP POLICY IF EXISTS "Users update own email preferences" ON public.user_email_preferences;
DROP POLICY IF EXISTS "Users insert own email preferences" ON public.user_email_preferences;

CREATE POLICY "Users view own email preferences"
ON public.user_email_preferences
FOR SELECT
TO authenticated
USING (
  public.current_auth_email() IS NOT NULL
  AND lower(email) = public.current_auth_email()
);

CREATE POLICY "Users update own email preferences"
ON public.user_email_preferences
FOR UPDATE
TO authenticated
USING (
  public.current_auth_email() IS NOT NULL
  AND lower(email) = public.current_auth_email()
)
WITH CHECK (
  public.current_auth_email() IS NOT NULL
  AND lower(email) = public.current_auth_email()
);

CREATE POLICY "Users insert own email preferences"
ON public.user_email_preferences
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_auth_email() IS NOT NULL
  AND lower(email) = public.current_auth_email()
);

REVOKE ALL ON public.user_email_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.user_email_preferences TO authenticated;
GRANT ALL ON public.user_email_preferences TO service_role;