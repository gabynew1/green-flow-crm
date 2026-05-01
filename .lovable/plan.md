## Problem

When a client creates their first property, the app needs to:
1. Insert a `customers` row, then
2. Update `profiles.customer_id` to link it.

Step 2 fails with **"infinite recursion detected in policy for relation profiles"**, so the customer→profile link is never made and the property cannot be saved.

## Root cause

The RLS policy `Users can update their own profile (restricted)` on `profiles` has this WITH CHECK expression:

```sql
(auth.uid() = user_id)
AND (NOT (email IS DISTINCT FROM (
  SELECT p.email FROM profiles p WHERE p.user_id = auth.uid()
)))
```

The inner `SELECT ... FROM profiles` re-triggers RLS on `profiles`, which re-evaluates the same policy → infinite recursion. The intent (prevent users from changing their own email) is correct, but the implementation must not query `profiles` from inside a `profiles` policy.

## Fix

### 1. Database migration

Replace the recursive subquery with a `SECURITY DEFINER` helper that bypasses RLS:

```sql
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT email FROM public.profiles WHERE user_id = _user_id $$;

DROP POLICY "Users can update their own profile (restricted)" ON public.profiles;

CREATE POLICY "Users can update their own profile (restricted)"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND NOT (email IS DISTINCT FROM public.get_user_email(auth.uid()))
);
```

This preserves the email-immutability rule without recursion.

### 2. Frontend cleanup (`src/pages/client/ClientDashboard.tsx`)

The `handleAdd` flow already creates a customer then links it. Once the migration lands, no code change is strictly required, but I will:
- Keep the existing logic.
- Improve the error message if the link step still fails (defensive).

### 3. Verification

After the migration, log in as a client without a `customer_id` and add a property. Expect: customer row created, profile linked, property saved, dashboard reloads.

## Out of scope

No changes to the `Providers can view tenant profiles` policy — its `customers` subquery is safe (different table, no recursion path back into `profiles`).