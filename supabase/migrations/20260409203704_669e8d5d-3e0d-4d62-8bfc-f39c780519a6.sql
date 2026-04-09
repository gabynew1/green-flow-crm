
-- Allow provider admins to manage global holidays
CREATE POLICY "Provider admins can manage holidays"
  ON public.global_holidays FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'PROVIDER_ADMIN'))
  WITH CHECK (has_role(auth.uid(), 'PROVIDER_ADMIN'));
