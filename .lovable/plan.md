# Fix: empty Customer dropdown in "Create visit"

## Problem (confirmed)
In `src/components/provider/CreateAdHocVisitDialog.tsx`, the data loader no longer fetches customers or properties — both queries were replaced with hardcoded empty results (`Promise.resolve({ data: [] })`) and the state is then set to `[]`. Only services and teams are actually loaded. So the Customer dropdown is always empty, and the Property dropdown is empty as a consequence.

## Fix
Restore the two real, tenant-scoped queries in `loadData()`:

- Customers: read active customers for the current tenant, ordered by name.
- Properties: read properties for the current tenant (id, name, customer_id), ordered by name; the property dropdown continues to filter by the selected customer.

Both stay guarded on `tenantId` so nothing loads without tenant context, keeping tenant isolation intact.

## Notes
- No database or policy changes needed — this is purely a restored client query.
- Behaviour after the fix: pick customer → property list narrows to that customer's properties → contracts load as today.

## Files
- `src/components/provider/CreateAdHocVisitDialog.tsx` (`loadData`, ~lines 125-143)
