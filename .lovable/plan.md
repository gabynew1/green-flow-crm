

# Fix: Allow clients to create properties without pre-linked customer

## Problem
When a client tries to add a property, the code checks `profile.customer_id` (line 88). New client users created via the `handle_new_user` trigger get a profile but **no `customer_id`** — it's left `NULL`. So the toast says "Your account is not linked to a customer. Contact your provider." and blocks property creation.

## Solution
Auto-create a `customers` record for the client if they don't have one yet, then link it to their profile before inserting the property.

### Changes in `src/pages/client/ClientDashboard.tsx` — `handleAdd` function

Replace the early-return block (lines 82-91) with:

1. Fetch `profile.customer_id` as before
2. If `customer_id` is `NULL`:
   - Fetch `profile.full_name` and `profile.email`
   - Insert a new row into `customers` table with the user's name/email
   - Update `profiles.customer_id` to the new customer's ID
   - Use the new `customer_id` going forward
3. Proceed with property insert using the (now-guaranteed) `customer_id`

### DB Migration
Add an RLS policy so clients can insert their own customer record:
```sql
CREATE POLICY "Clients can insert their own customer"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

Also need UPDATE on profiles for setting `customer_id` — already covered by existing "Users can update their own profile" policy.

### Files
| File | Change |
|------|--------|
| `src/pages/client/ClientDashboard.tsx` | Auto-create customer in `handleAdd` when `customer_id` is null |
| DB Migration | Allow authenticated users to insert into `customers` |

