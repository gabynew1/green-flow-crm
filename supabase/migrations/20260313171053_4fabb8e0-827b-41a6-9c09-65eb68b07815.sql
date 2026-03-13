DROP POLICY "Clients can insert their own customer" ON public.customers;
CREATE POLICY "Clients can insert their own customer"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.customer_id IS NOT NULL
    )
  );