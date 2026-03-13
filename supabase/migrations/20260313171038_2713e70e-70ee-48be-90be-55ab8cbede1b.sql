CREATE POLICY "Clients can insert their own customer"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (true);