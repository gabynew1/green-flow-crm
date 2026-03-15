-- Super admins can view all profiles (needed for GlobalUserManagement)
CREATE POLICY "Super admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_super_admin(auth.uid()));

-- Super admins can update any profile (needed for lock/unlock, license changes)
CREATE POLICY "Super admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));