## Root cause (confirmed against the DB)

Own tenant has exactly 1 `Alley cleaning`. The screenshot shows 4 because 4 rows exist across the DB (1 own + 1 NULL-tenant "global template" + 2 other tenants), and the contract page fetches `service_catalog` **without a tenant filter**. The current SELECT policy also permits any authenticated user to read `tenant_id IS NULL` rows — the global template intended only as source for the "Import default catalog" RPC — so those templates surface directly in pickers alongside the real tenant rows. Any picker that omits the tenant filter is exposed.

## Fix — defense in depth, three layers

### Layer 1 — RLS: make cross-tenant reads structurally impossible

Migration on `public.service_catalog`:

- Drop the current SELECT policy `"Authenticated users can view own tenant or global services"`.
- Replace with `"Providers view own tenant catalog"` — `is_active AND tenant_id IS NOT NULL AND tenant_id = get_user_tenant_id(auth.uid())`. No NULL branch, no cross-tenant branch.
- Keep the super-admin management policy but scope its **SELECT** to service-role/admin ops only (super admins still manage globals via the admin UI which uses service role); they no longer implicitly see globals mixed into provider pickers when signed in as a provider.
- Add a matching `service_catalog_translations` SELECT policy that mirrors the parent (own-tenant only), so translations can never leak either.

Data cleanup in the same migration:

- Backfill: for each active provider tenant that is missing a global template row (matched by `code + name`), insert a copy owned by that tenant. This guarantees no tenant loses services when the NULL rows become invisible.
- Then `DELETE FROM public.service_catalog WHERE tenant_id IS NULL`. Update `import_default_service_catalog()` RPC so it seeds from a hard-coded catalog constant instead of reading NULL rows (or from a new `service_catalog_defaults` reference table if we want it editable — call this out; simplest is inlined constant).
- Add `ALTER TABLE public.service_catalog ALTER COLUMN tenant_id SET NOT NULL` after the delete, so NULL-tenant rows can never be created again.

### Layer 2 — Client: stop trusting RLS as the only gate

Every `service_catalog` read on the frontend must include `.eq("tenant_id", tenantId)`. Fix the three offenders (all confirmed by grep):

1. `src/pages/provider/ContractDetail.tsx:80` — Add-Line dialog service picker.
2. `src/pages/provider/OfferDetail.tsx:48` — offer line-item picker.
3. `src/pages/provider/VisitDetail.tsx:91` — visit item picker.

Guard each query so it does not fire until `tenantId` is known.

### Layer 3 — Prevent regressions: repo-wide audit + lint

- Grep audit (done): safe callers already filter by tenant (`ContractNew`, `Contracts`, `CreatePipelineItemDialog`, `CreateAdHocVisitDialog`, `ServiceCatalog`). No other `service_catalog` reads exist besides the 3 above and joins via foreign key.
- Broader tenant-isolation sweep: re-run the same grep for every tenanted table (`customers`, `properties`, `contracts`, `contract_line_items`, `service_orders`, `service_order_items`, `invoices`, `invoice_line_items`, `inventory_items`, `teams`, `service_zones`, `service_catalog_translations`, `inventory_category_translations`). Flag any `.from("<table>").select(...)` that omits `.eq("tenant_id", …)` **and** isn't a join through an already-tenant-scoped parent. Fix any offenders in the same PR. If none are found, note that explicitly.
- Add a short section to `TEST_PLAN.md` — "Tenant isolation regression": as tenant A, open Add-Line on a contract, add-item on an offer, add-item on a visit, and confirm every service appears exactly once and matches what Service Catalog shows.

## Verification steps after the migration lands

1. `SELECT count(*) FROM service_catalog WHERE tenant_id IS NULL;` returns 0.
2. Per-tenant count equals what the tenant sees in `/provider/catalog`.
3. Sign in as a provider, open Add Line on `/provider/contracts/…` → each service listed once.
4. Repeat on Offer detail and Visit detail.
5. Sign in as another tenant and confirm they only see their own catalog and none of tenant A's.
6. Re-run `security--run_security_scan` and `supabase--linter` and confirm no new findings on `service_catalog`.

## Explicitly not in scope

- No changes to the visible catalog contents beyond the NULL cleanup and the per-tenant backfill.
- No UI redesign of the pickers.
