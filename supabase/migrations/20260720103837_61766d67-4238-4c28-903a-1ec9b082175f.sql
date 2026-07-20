CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
BEGIN
  IF current_setting('role', true) IN ('service_role') OR session_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_admin := public.is_super_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    is_admin := false;
  END;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.provider_permission IS DISTINCT FROM OLD.provider_permission
     OR NEW.license_type IS DISTINCT FROM OLD.license_type
     OR NEW.is_locked IS DISTINCT FROM OLD.is_locked
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Reactivate tenant so QA (and normal use) works
UPDATE public.tenants SET status='active' WHERE id='67277905-6cfa-4a37-8b76-b9f2fc2cb95f' AND status='suspended';