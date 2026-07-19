# Feedback Triage & Fix Plan

Each feedback item was reviewed against the codebase. Verdicts and grouped fixes below.

## Verdicts (per feedback item)

**Inventory**
1. "Nu pot edita articolul" — **Valid.** `InventoryTab.tsx` only supports Add + Delete. No edit UI or row click.
2. "Health status apare direct healthy" — **Valid but different root cause.** Health is derived from `updated_at` age, not from user input. There is no real `health_status` field. Feature is misleading.
3. "Nu pot edita denumirea" — **Same as #1** (no edit at all).
4. "Category LAWN name also 'Gazon' — inestetic" — **Cosmetic valid.** Category badge and item name both show "Gazon". Low-value duplication.

**Contract section**
5. "Customer, property, zone nu pot modifica după save" — **Valid.** No edit UI on `ContractDetail`; must recreate.
6. "Zone la ce foloseste, nu inteleg" — **Valid UX.** Zone on contract duplicates zone on property (already assigned). Adds confusion, no extra value.
7. "Frecvență lipsă opțiune 'pe contract'" — **Valid.** Only PER_VISIT/WEEK/MONTH/YEAR/ONE_TIME exist; no "per contract lifetime" option (e.g. herbicide once during a 12-month contract).
8. "Unitățile nu ajută, pot fi eliminate" — **Valid.** `unit` on line items adds noise; quantity + service is enough for the provider's mental model.
9. "Lipsă servicii irigare (golire, punere în funcțiune, verificare)" — **Valid.** Not present in seed catalog.
10. "Flat fee + selectare + Contract total confusing" — **Valid.** In flat-fee mode the per-service checkboxes still show and duplicate the total row.
11. "Frecvență și pe durata contractului" — **Same as #7.**

**New Customer**
12. "Name / Contact person / Company se bat cap în cap" — **Valid.** Three overlapping name fields; users confuse them.
13. "Ordinea tab-urilor: Properties → Contracts → Service Visits" — **Valid.** Current order in `CustomerDetail.tsx` is Contracts → Visits → Properties. Reversing matches the natural onboarding flow.

## Fix Plan (ordered for minimal churn, max UX gain)

### Fix 1 — Inventory: make items fully editable, drop fake "Health"
- Add inline edit on every inventory row (name, category, quantity, notes) via a single "Edit" pencil that swaps the row into edit mode, plus Save/Cancel.
- Remove the "Health" column and `getHealthBadge` entirely (it was inferred from `updated_at`, not real data).
- Fix category/name duplication: when the item name equals the category label, show only the badge (drop the redundant name line).
- No DB migration required; `inventory_items` already stores name/category/quantity/notes.

### Fix 2 — Contract creation: remove unit + zone, add "per contract" frequency
- Remove the **Unit** selector from `ContractNew.tsx` and from the line-item display in `ContractDetail` / `PropertyContractsTab` / `ClientContractDetail`. Keep the column in DB (`contract_line_items.unit`) for back-compat; default new rows to `"unit"` silently. Existing rows keep their values but are no longer shown.
- Remove **Service Zone** selector from contract create/edit. Zone stays on the property (single source of truth). Backfill: nothing to migrate — zone on contract was optional and cosmetic; existing values remain in DB but hidden.
- Add new frequency option **`PER_CONTRACT`** ("o dată pe contract") to the frequency dropdown and to `freqLabel` maps. Enum extension in `contract_line_items.frequency_type` via migration (add value, no data change).

### Fix 3 — Contract editability after save
- Add an "Edit" mode on `ContractDetail.tsx` header allowing changes to: contract name, property, start/end date, billing cycle. Customer stays locked (changing customer would orphan visits/invoices).
- Reuse existing form controls from `ContractNew.tsx` where possible.

### Fix 4 — Simplify flat-fee UX
- When category = "Regular Maintenance" (flat-fee mode): hide the per-service checkbox list entirely and show only the flat-fee amount input + auto-generated line description. Remove the redundant "Contract total" row (already equals flat fee).
- Add the same **PER_CONTRACT** option to the flat-fee frequency picker.

### Fix 5 — Add missing irrigation services (seed)
Insert into `service_catalog` (global, tenant_id NULL) under "Regular Maintenance":
- Golire instalație de irigare și pregătire pentru iarnă
- Punere în funcțiune instalație de irigare după iarnă
- Verificare funcționare instalație irigare
Include RO + EN translations in `service_catalog_translations`. Idempotent insert (skip if code+name exists).

### Fix 6 — New Customer form: collapse name fields
- In the new-customer form: keep a single **Name** field (person or company). Add optional **Company (if different)** field. Drop the confusing separate "Contact person" input; the contact person defaults to Name and can be edited later in `CustomerManage`.
- No DB migration; `customers.contact_person_name` stays for existing data (backfilled from `name` where NULL via one-time UPDATE).

### Fix 7 — Reorder Customer Detail sections
- In `src/pages/provider/CustomerDetail.tsx` reorder JSX blocks to: **Properties → Contracts → Service Visits**. Pure presentational change.

## Technical notes

- **Migrations:**
  1. `ALTER TYPE ... ADD VALUE 'PER_CONTRACT'` on the frequency enum (or CHECK constraint update if it's a text column — verify at implementation).
  2. Seed 3 new services + RO/EN translations, idempotent.
  3. Backfill: `UPDATE customers SET contact_person_name = name WHERE contact_person_name IS NULL;`
- **Removed complexity:** unit selector on contract lines, zone selector on contracts, fake health badge, redundant contract-total row, contact-person field on create form.
- **No data loss:** all removals hide fields; underlying columns retained for historical records.
- **Files touched (approx):** `InventoryTab.tsx`, `ContractNew.tsx`, `ContractDetail.tsx`, `PropertyContractsTab.tsx`, `ClientContractDetail.tsx`, `CustomerDetail.tsx`, `Customers.tsx` (or the create-customer dialog), one new migration, translation JSON updates for new frequency label + service names.
