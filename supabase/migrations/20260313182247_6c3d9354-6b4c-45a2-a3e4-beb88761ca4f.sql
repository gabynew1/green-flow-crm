-- Allow clients to UPDATE contracts linked to their properties (approve/reject only)
CREATE POLICY "Clients can update contract status"
ON public.contracts
FOR UPDATE
TO authenticated
USING (
  property_id IN (
    SELECT p.id FROM properties p
    WHERE p.customer_id = get_user_customer_id(auth.uid())
  )
)
WITH CHECK (
  property_id IN (
    SELECT p.id FROM properties p
    WHERE p.customer_id = get_user_customer_id(auth.uid())
  )
);