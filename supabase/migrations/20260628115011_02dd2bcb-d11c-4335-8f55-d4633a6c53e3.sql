
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Allow service_role / postgres unconditionally
  IF current_setting('role', true) IN ('service_role') OR session_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- Super admins may modify everything
  BEGIN
    is_admin := public.is_super_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    is_admin := false;
  END;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- For everyone else, lock sensitive fields to OLD values
  IF NEW.provider_permission IS DISTINCT FROM OLD.provider_permission
     OR NEW.license_type IS DISTINCT FROM OLD.license_type
     OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
