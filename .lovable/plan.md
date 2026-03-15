

## Plan: Prevent Duplicate Customer Accounts by Email

### Problem
Multiple customer accounts can be created with the same email address across different insertion points in the app.

### Solution

**1. Database: Add unique constraint on `(email, tenant_id)`**

Migration:
```sql
CREATE UNIQUE INDEX idx_customers_email_tenant 
ON customers (lower(email), tenant_id) 
WHERE email IS NOT NULL AND status != 'DELETED';
```
This partial unique index prevents duplicates per tenant while allowing null emails and not counting deleted customers.

**2. Add client-side duplicate checks before insert**

In all customer creation flows, check for existing customer with same email before inserting:

- **`src/pages/provider/Customers.tsx`** (`handleCreate`) — check email before insert, show error if duplicate
- **`src/components/provider/CreateOpportunityDialog.tsx`** (`handleNew`) — same check
- **`src/components/client/ConnectionRequests.tsx`** (`respond` APPROVED) — same check
- **`src/pages/client/ClientDashboard.tsx`** — same check

Each check queries: `supabase.from("customers").select("id, name").eq("email", email).eq("tenant_id", tenantId).neq("status", "DELETED").limit(1)` and if a match exists, shows a toast error like "A customer with this email already exists: [name]".

### Files
- **Migration**: Unique partial index on `customers(email, tenant_id)`
- **Edit**: `src/pages/provider/Customers.tsx` — duplicate check in `handleCreate`
- **Edit**: `src/components/provider/CreateOpportunityDialog.tsx` — duplicate check in `handleNew`
- **Edit**: `src/components/client/ConnectionRequests.tsx` — duplicate check in `respond`
- **Edit**: `src/pages/client/ClientDashboard.tsx` — duplicate check

