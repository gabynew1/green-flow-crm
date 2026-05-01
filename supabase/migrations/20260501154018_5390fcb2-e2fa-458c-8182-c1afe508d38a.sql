DROP FUNCTION IF EXISTS public.lookup_client_by_code(text);

CREATE OR REPLACE FUNCTION public.lookup_client_by_code(_code text)
RETURNS TABLE (
  user_id uuid,
  unique_client_id text,
  full_name text,
  email text,
  customer_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.unique_client_id, p.full_name, p.email, p.customer_id
  FROM public.profiles p
  WHERE p.unique_client_id = upper(trim(_code))
    AND public.is_provider(auth.uid())
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_client_by_code(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_code(text) TO authenticated;