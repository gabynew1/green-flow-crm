
-- Allow clients to INSERT properties where customer_id matches their own
CREATE POLICY "Clients can insert their own properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (customer_id = get_user_customer_id(auth.uid()));

-- Allow clients to UPDATE their own properties
CREATE POLICY "Clients can update their own properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (customer_id = get_user_customer_id(auth.uid()));

-- Allow clients to DELETE their own properties
CREATE POLICY "Clients can delete their own properties"
ON public.properties
FOR DELETE
TO authenticated
USING (customer_id = get_user_customer_id(auth.uid()));
