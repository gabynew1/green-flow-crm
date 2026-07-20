## B1 · Billing invoices list 400 (missing FK for PostgREST embed)

Confirmed: `public.invoices` has zero FKs on `customer_id` / `contract_id`. `Billing.tsx` embeds `customers(...)` and `contracts(...)`, which PostgREST rejects.

Fix (schema, not code — preserves the current query shape and enables future embeds):
- Migration: add `invoices_customer_id_fkey` → `public.customers(id) ON DELETE RESTRICT`, and `invoices_contract_id_fkey` → `public.contracts(id) ON DELETE SET NULL`.
- No code changes; `Billing.tsx` embed starts resolving.
- Verification: `psql \d public.invoices` shows both FKs; reload `/provider/billing` — table renders, no 400.

## B2 · Customer email history 403 for PROVIDER_ADMIN

Confirmed root cause: `get_customer_email_history(uuid,int,int)` has no `EXECUTE` grant to `authenticated` (only `postgres` / `service_role`). PostgREST returns 403 before the function body ever runs, so the `is_provider` gate is fine — the grant is missing.

Fix:
- Migration: `GRANT EXECUTE ON FUNCTION public.get_customer_email_history(uuid, integer, integer) TO authenticated;`
- No code changes needed. The function already restricts to `is_provider(auth.uid())` + same-tenant customer, so this is a safe grant.
- Verification: as `test@acme.io`, open a customer → "Emails sent to this customer" card loads without 403.

## B3 · Zone `description` field never shipped

`public.service_zones` has no `description` column and `ZonesSettings.tsx` dialog exposes only Name + color. TEST_PLAN §3 / §13 require a free-text description.

Fix (data + UI):
1. Migration: `ALTER TABLE public.service_zones ADD COLUMN description text;` (nullable, no default).
2. `src/components/provider/ZonesSettings.tsx`:
   - Add `description` to the local form state and to the create/edit mutation payload.
   - Add a `<Textarea>` labeled "Description / addresses" beneath the name field in the New/Edit Zone dialog with a short helper ("List streets or landmarks that belong to this zone").
   - In the zone list row, show a 1–2 line clamp of the description when present.
3. `src/components/provider/ZoneChip.tsx`: unchanged (chip stays name-only); add zone description into the tooltip only if trivially available — otherwise leave for a follow-up.
4. Verification: create + edit a zone with a description; reopen dialog and confirm value persists; list shows the clamp.

## Order of execution
1. Single migration containing all three DB changes (2 FKs, 1 GRANT, 1 ADD COLUMN).
2. Frontend edit to `ZonesSettings.tsx` only.
3. Manual smoke on `/provider/billing`, customer email history card, and Settings → Zones.

## Out of scope
No changes to the invoice query itself, no changes to `is_provider` / RPC body, no changes to `ZoneChip` layout, no data backfill (description defaults to NULL). B4 (sidebar i18n) and B5 (sections vs tabs) remain deferred per TEST_RUN report.
