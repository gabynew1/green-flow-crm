

## Plan: Customer Manage Account (Delink & Delete)

### Overview
Add a "Manage Account" button on `CustomerDetail` page, linking to a new `CustomerManage` page. The provider can **Delink** (customer becomes visually "Delinked" — hidden from active list) or **Delete** (customer hidden entirely). Both require typing the customer name to confirm.

### No Database Changes Needed
Customer status (Active/Inactive) is already derived from contracts — there's no `status` column on the `customers` table. For Delink/Delete, we'll add a `status` column with default `'ACTIVE'` to the `customers` table. Values: `ACTIVE` (default), `DELINKED`, `DELETED`. This doesn't conflict with the contract-based active/inactive display — that remains a UI derivation. The new column tracks account-level actions.

**Migration:**
```sql
ALTER TABLE customers ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE';
```

### Files to Create/Edit

**1. New: `src/pages/provider/CustomerManage.tsx`**
- Fetches customer by ID
- Two action cards: "Delink Customer" and "Delete Customer"
- Each opens a confirmation dialog requiring the user to type the exact customer name (case-insensitive)
- **Delink**: `UPDATE customers SET status = 'DELINKED' WHERE id = ...` → navigate back to `/provider/customers`
- **Delete**: `UPDATE customers SET status = 'DELETED' WHERE id = ...` → navigate back to `/provider/customers`

**2. Edit: `src/pages/provider/CustomerDetail.tsx`**
- Add "Manage Account" button top-right, inline with customer name
- Links to `/provider/customers/${customerId}/manage`

**3. Edit: `src/pages/provider/Customers.tsx`**
- Filter out customers with `status = 'DELETED'` entirely
- Show `DELINKED` customers with a "Delinked" badge (distinct from contract-based Active/Inactive)

**4. Edit: `src/App.tsx`**
- Add route: `/provider/customers/:customerId/manage` → `CustomerManage`

### Files
- **Migration**: Add `status` column to `customers`
- **New**: `src/pages/provider/CustomerManage.tsx`
- **Edit**: `src/pages/provider/CustomerDetail.tsx` — "Manage Account" button
- **Edit**: `src/pages/provider/Customers.tsx` — filter DELETED, badge DELINKED
- **Edit**: `src/App.tsx` — new route

