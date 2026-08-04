REVOKE ALL ON FUNCTION public.admin_list_email_activity(text, text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_email_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_email_activity(text, text, text, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_email_health() TO authenticated, service_role;