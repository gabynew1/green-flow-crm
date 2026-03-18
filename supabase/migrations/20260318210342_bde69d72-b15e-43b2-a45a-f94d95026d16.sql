
CREATE OR REPLACE FUNCTION public.email_exists(_email text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE email = _email
  )
$$;

-- Allow anon to call this function
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO authenticated;
