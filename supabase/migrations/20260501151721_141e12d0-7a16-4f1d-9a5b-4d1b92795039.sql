CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles WHERE user_id = _user_id
$$;

DROP POLICY IF EXISTS "Users can update their own profile (restricted)" ON public.profiles;

CREATE POLICY "Users can update their own profile (restricted)"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (email IS DISTINCT FROM public.get_user_email(auth.uid()))
);