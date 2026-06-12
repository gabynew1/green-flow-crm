
-- Sync last-login fields from auth.users.last_sign_in_at as a safety net
-- for any code path that bypasses the lifecycle-touch-login function.
CREATE OR REPLACE FUNCTION public.sync_lifecycle_login_timestamps()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_updated int := 0;
  c_updated int := 0;
BEGIN
  -- Tenants: most recent admin sign-in across all PROVIDER_ADMIN profiles in the tenant.
  WITH agg AS (
    SELECT p.tenant_id, max(u.last_sign_in_at) AS last_sign_in_at
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'PROVIDER_ADMIN'
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.tenant_id IS NOT NULL AND u.last_sign_in_at IS NOT NULL
    GROUP BY p.tenant_id
  )
  UPDATE public.tenants t
  SET last_admin_login_at = agg.last_sign_in_at
  FROM agg
  WHERE t.id = agg.tenant_id
    AND (t.last_admin_login_at IS NULL OR agg.last_sign_in_at > t.last_admin_login_at);
  GET DIAGNOSTICS t_updated = ROW_COUNT;

  -- Customers: most recent client sign-in across all CLIENT_USER profiles for the customer.
  WITH agg AS (
    SELECT p.customer_id, max(u.last_sign_in_at) AS last_sign_in_at
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.user_id AND ur.role = 'CLIENT_USER'
    JOIN auth.users u ON u.id = p.user_id
    WHERE p.customer_id IS NOT NULL AND u.last_sign_in_at IS NOT NULL
    GROUP BY p.customer_id
  )
  UPDATE public.customers c
  SET last_client_login_at = agg.last_sign_in_at
  FROM agg
  WHERE c.id = agg.customer_id
    AND (c.last_client_login_at IS NULL OR agg.last_sign_in_at > c.last_client_login_at);
  GET DIAGNOSTICS c_updated = ROW_COUNT;

  RETURN jsonb_build_object('tenants_updated', t_updated, 'customers_updated', c_updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_lifecycle_login_timestamps() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sync_lifecycle_login_timestamps() TO service_role;
