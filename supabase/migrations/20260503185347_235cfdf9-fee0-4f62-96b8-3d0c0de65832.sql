REVOKE EXECUTE ON FUNCTION public.is_business_moment(timestamptz)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_business_moment(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_active(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_customer_active(uuid)          FROM PUBLIC, anon;