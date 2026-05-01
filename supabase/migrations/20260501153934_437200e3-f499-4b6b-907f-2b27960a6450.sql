-- SECURITY DEFINER lookup so providers can find a client by GC-XXXXXX even when no row-level visibility exists yet.
-- Returns ONLY the minimal fields needed to display & create a connection request. No PII beyond name.

CREATE OR REPLACE FUNCTION public.lookup_client_by_code(_code text)
RETURNS TABLE (
  user_id uuid,
  unique_client_id text,
  full_name text,
  customer_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.unique_client_id, p.full_name, p.customer_id
  FROM public.profiles p
  WHERE p.unique_client_id = upper(trim(_code))
    AND public.is_provider(auth.uid())  -- only providers may resolve client codes
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_client_by_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_code(text) TO authenticated;