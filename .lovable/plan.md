## Context

Good news — the default catalog was never deleted. The 54 services still live in `service_catalog` with `tenant_id = NULL` (5 categories: Regular Maintenance, Garden Landscaping & Green Spaces, Irrigation System Maintenance, Design & Consulting, Special & Seasonal Services).

What changed: after the tenant-isolation work, the Service Catalog page now loads only `tenant_id = <my tenant>`, so each vendor sees an empty catalog until they add their own. The globals are still readable through RLS — they're just not displayed.

The 3-dot menu next to "+ Add Service" already exists (currently has "Manage Categories" and "Manage Units"). We just need to add one more item.

## What we'll deliver

1. **Treat `tenant_id IS NULL` rows as the canonical template.** No data restoration needed — they're intact. We protect them so no vendor can edit/delete them.
2. **New "Import default catalog" item** in the existing 3-dot dropdown on the Service Catalog page. Clicking it opens a small confirmation dialog and copies all 54 services into the vendor's own catalog (with `tenant_id = my tenant`), so the vendor can rename, re-price, deactivate, or delete each entry without touching the master template.
3. **Skip-duplicates behavior.** Re-running the import won't create duplicates (we match on `code` + `name`). The dialog tells the vendor exactly how many were added vs skipped.
4. **First-time helper.** When the vendor's catalog is empty, show an inline empty-state card with a one-click "Use the GreenGrass default catalog" button (same RPC), so new tenants get value immediately without hunting through menus.

## Technical details

**Database (migration)**

- Lock down the global template:
  - RLS update on `service_catalog`: providers can `SELECT` rows where `tenant_id IS NULL OR tenant_id = my_tenant`, but can only `INSERT/UPDATE/DELETE` rows where `tenant_id = my_tenant`. Today the "Providers can manage tenant catalog" policy lets a provider modify `tenant_id IS NULL` rows too — we'll narrow it.
  - Only super admins can write `tenant_id IS NULL` rows.
- New RPC `public.import_default_service_catalog()` (SECURITY DEFINER, callable by any provider):
  - Inserts every active `tenant_id IS NULL` row into the caller's tenant, skipping any (`code`, `name`) pair that already exists for that tenant.
  - Returns `jsonb { imported: n, skipped: n }`.
  - `auth.uid()` must be a provider; raises otherwise.

**Frontend (`src/pages/provider/ServiceCatalog.tsx`)**

- Add a `DropdownMenuItem` "Import default catalog…" between Manage Categories and Manage Units, with a `Download` icon.
- On click open a small confirm dialog: *"This will add the 54 standard GreenGrass services to your catalog. Existing entries with the same name are skipped. Continue?"*. On confirm: call the RPC, toast `Imported X services (Y skipped)`, then `load()`.
- When `services.length === 0`, show an empty-state card above the table with a primary "Use default catalog" button calling the same handler, plus a secondary "Start from scratch" link that just dismisses the card.

No other files need changes — the catalog is already consumed elsewhere via `useTenantQuery`/tenant-scoped selects, so imported rows show up automatically in offers, contracts, visits, etc.

## Out of scope

- Editing the master template from the app (it stays seed-only / super-admin only).
- Per-vendor selective import (all-or-nothing keeps the UI simple; vendors can deactivate or delete individual rows after import).
