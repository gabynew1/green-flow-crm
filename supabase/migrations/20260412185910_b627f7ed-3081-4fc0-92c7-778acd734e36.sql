
-- 1. Fix provider_invites: remove the overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can read invite by exact token" ON public.provider_invites;

-- 2. Fix user_roles cross-tenant escalation: replace policy with tenant-scoped one
DROP POLICY IF EXISTS "Provider admins can manage roles" ON public.user_roles;

CREATE POLICY "Provider admins can manage same-tenant roles"
ON public.user_roles
FOR ALL
USING (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p1
    JOIN public.profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = user_roles.user_id
      AND p1.tenant_id IS NOT NULL
  )
)
WITH CHECK (
  has_role(auth.uid(), 'PROVIDER_ADMIN'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.profiles p1
    JOIN public.profiles p2 ON p1.tenant_id = p2.tenant_id
    WHERE p1.user_id = auth.uid()
      AND p2.user_id = user_roles.user_id
      AND p1.tenant_id IS NOT NULL
  )
);

-- 3. Fix offers status bypass: restrict WITH CHECK to valid client transitions
DROP POLICY IF EXISTS "Clients can update offer status" ON public.offers;

CREATE POLICY "Clients can update offer status"
ON public.offers
FOR UPDATE
USING (
  customer_id = get_user_customer_id(auth.uid())
  AND status = 'SENT_TO_CLIENT'::offer_status
)
WITH CHECK (
  customer_id = get_user_customer_id(auth.uid())
  AND status IN ('ACCEPTED'::offer_status, 'REJECTED'::offer_status)
);
