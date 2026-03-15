

## Plan: Show Client Profile Info on Provider's Customer Detail Page

### Problem
The `customers` table has its own `contact_person_name`, `email`, and `phone` columns — but these are set by the provider when creating the customer record. When a client updates their profile (name, phone) via the Client Profile page, that data is saved to the `profiles` table, not `customers`. So the provider sees empty/stale fields.

### Solution
On `CustomerDetail.tsx`, fetch the linked `profiles` record (where `profiles.customer_id = customer.id`) and display that data alongside (or merged with) the customer record.

### Changes

**`src/pages/provider/CustomerDetail.tsx`**
1. In the `load()` function, add a query: `supabase.from("profiles").select("full_name, email, phone, unique_client_id").eq("customer_id", customerId).maybeSingle()`
2. Store the result in a `clientProfile` state variable.
3. In the contact info card, merge profile data with customer data — prefer profile values when available (e.g., show `clientProfile.phone` if `customer.phone` is empty, or show both).
4. Display the client's Unique Client ID if available.

### No DB changes needed.
The `profiles` table already has a SELECT policy for providers (`is_provider(auth.uid())`), so providers can read client profiles.

