

## Plan: Single Source of Truth — Profiles → Customers Sync

### Problem
Profile data (name, email, phone) lives in two tables. Client updates go to `profiles`, but providers read from `customers`. They drift apart.

### Solution

**1. Database trigger: auto-sync profile → customers**

Create a `SECURITY DEFINER` trigger function on `profiles` that fires `AFTER UPDATE OF full_name, email, phone`. When the profile has a `customer_id`, it updates the matching `customers` row:
- `contact_person_name` = `NEW.full_name`
- `email` = `NEW.email`
- `phone` = `NEW.phone`

**2. One-time backfill**

Run an UPDATE to sync all existing profile data into their linked customer records (where `profiles.customer_id IS NOT NULL`).

**3. Tighten provider access to profiles**

Current RLS lets providers see ALL profiles (`is_provider(auth.uid())`). Replace with two narrower policies:
- Providers can SELECT profiles **only where** `profiles.customer_id` is in a customer belonging to their tenant
- Providers can SELECT profiles by `unique_client_id` lookup (needed for the "Connect Client" flow) — actually this is covered by the above since the lookup happens before the customer link exists. Instead, allow providers to select profiles but **only the columns** `user_id, full_name, unique_client_id` — RLS can't do column-level restrictions, so we keep the existing policy but this is acceptable since the connect flow needs it.

Actually, re-evaluating: the connect flow in `Customers.tsx` line 93 queries `profiles` by `unique_client_id` before any link exists. If we restrict to only linked profiles, that breaks. The current broad SELECT for providers is needed for this flow. We'll keep it but the key point is: the **displayed data** on `CustomerDetail` comes from `customers` (synced by trigger), not from a direct profile read.

**4. Simplify `CustomerDetail.tsx`**

Remove the `clientProfile` state and the extra profiles query. Display contact info directly from the `customers` table (which the trigger keeps in sync). Keep only a minimal query for `unique_client_id` from profiles since that column doesn't exist on customers.

**5. No changes to `ClientProfile.tsx`**

It already updates `profiles`. The trigger propagates changes automatically.

**6. `ConnectionRequests.tsx` — already correct**

When a client approves a connection, it already copies `full_name`, `email`, `phone` from profiles into the new customer record (line 44-53). The trigger will handle subsequent updates.

### Files to change
- **Migration SQL**: trigger function + backfill
- **`src/pages/provider/CustomerDetail.tsx`**: remove overlay logic, read from customers only (keep `unique_client_id` from profiles)

