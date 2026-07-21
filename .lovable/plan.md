
## Review of the uploaded prompt

The prompt is **UI-only** and it's a good fit for our biggest pain point: the "Add Line Item" modal and the line-items table conflate "included in the flat fee" vs "billed extra", and mix the contract's visit cadence with per-line scope windows. The two-section table (Allowances vs Extras) and the "Pricing Model" toggle in the modal directly resolve the flat-fee heuristic that `docs/contracts-services-inventory.md` §7 flagged.

What the prompt gets right for us:
- Splitting the table into **Included Allowances** and **Additional Billable Services** matches how `getContractConsumption` already thinks (max/period vs unlimited priced).
- Renaming Frequency → "Allowance Window", Max/Period → "Allowance Limit", Unit Price → "Overage Price" removes the biggest UX confusion in `ContractDetail.tsx`.
- Hiding Quantity for included lines aligns with our rule that `quantity` is a money concept and irrelevant when nothing is billed per unit.

What we must adapt (not copy blindly):
- The prompt assumes `is_included_in_base_fee` already exists. In our schema it doesn't — we still detect "included" via `unit_price IS NULL` and a sibling "Flat fee%" row (see `contract-consumption.ts` and `VisitDetail.tsx`). We need a small additive migration, but **not** the destructive `NOT NULL` + `UPDATE unit_price=0` from your earlier system-architecture message. That earlier step would break: (a) the flat-fee sibling row detection in `VisitDetail.tsx`, (b) `PropertyContractsTab.tsx` totals, (c) `getContractConsumption` inference, and (d) offer→contract cloning in `recreateFromOffer`.
- The prompt only touches `ContractDetail.tsx`. To avoid drift we must apply the same shape in `ContractNew.tsx` (creation wizard) and read-side displays in `ClientContractDetail.tsx` and `PropertyContractsTab.tsx`.
- "Overage Price" is a new concept for us. Today an over-scope delivery is just flagged; it isn't auto-billed. We should surface the field but keep the auto-invoice behaviour unchanged in this pass (documented as a follow-up).

## Scope of this plan

Frontend-only refactor + one additive column. No changes to invoice generation, no `NOT NULL` constraints, no data destruction, no changes to `offer_line_items` / `service_order_items` shape.

### 1. Additive schema (single migration)

- Add `contract_line_items.is_included_in_base_fee boolean NOT NULL DEFAULT false`.
- Backfill: set `true` where `unit_price IS NULL` (mirrors today's heuristic).
- Keep `unit_price` nullable. Keep the "Flat fee%" sibling row pattern. No other column changes.
- Add the same column to `offer_line_items` (mirror), backfilled the same way, so accepting an offer preserves the flag in `recreateFromOffer`.

Reads continue to work: existing consumers that check `unit_price IS NULL` keep working; new UI reads `is_included_in_base_fee` as the source of truth and falls back to the null check for rows the migration hasn't touched.

### 2. "Add Line Item" modal refactor (`ContractDetail.tsx`)

At the top of the form, add a `RadioGroup` "Pricing Model":
- **Covered by Subscription** (`is_included_in_base_fee = true`)
  - Fields: Category, Service, Allowance Window (`frequency_type`), Allowance Limit (`max_occurrences_per_period`), Overage Price (`unit_price`, optional, 0 = "no charge for extras").
  - Hidden: Quantity. Hard-set `quantity = 1` on insert.
- **Billed Separately** (`is_included_in_base_fee = false`)
  - Fields: Category, Service, Quantity, Unit Price, plus an optional Allowance Window when the provider still wants to cap it (kept because we already use `PER_VISIT` extras today).
  - Hidden: Allowance Limit unless a window other than `PER_VISIT` is chosen.

Insert path in `handleAddLine` writes `is_included_in_base_fee` and, for the included branch, stores `unit_price = <overage price or null>` and `quantity = 1`.

### 3. Line-items table refactor (`ContractDetail.tsx`)

Replace the single table with two grouped sections, both filtered by the existing category filter:

- **Section A — Included Allowances** (`is_included_in_base_fee = true`)
  Columns: Category · Service · Allowance (formatted "N / month", "N / year", "Unlimited", "One-time") · Overage Price · Actions.
  No "Line Total" column. Show the current-period `consumed / max` badge sourced from `getContractConsumption` so providers see scope burn without leaving the page (also closes doc §7 item 3).

- **Section B — Additional Billable Services** (`is_included_in_base_fee = false`)
  Columns: Category · Service · Quantity · Unit Price · Line Total · Actions.
  Line Total = `quantity × unit_price`, rendered via `formatCurrency(..., currency)` — no hardcoded symbols.

Remove the standalone "Frequency" column; for Section A it becomes the "Allowance" string, for Section B frequency is implicit (per-visit) and hidden unless non-default.

Bulk actions ("Add All", "Remove Checked") stay; "Add All" seeds rows as **Billed Separately** with the catalog's default price (current behavior) so nothing regresses.

### 4. Mirror the new modal in `ContractNew.tsx`

The creation wizard already writes `contract_line_items`. Reuse the same "Pricing Model" toggle and the same insert shape so contracts start life with `is_included_in_base_fee` populated correctly. The existing "flat fee row + included siblings" pattern is preserved — the toggle just makes intent explicit instead of inferring from `unit_price IS NULL`.

### 5. Read-side alignment (minimal)

- `ClientContractDetail.tsx`: switch to the two-section layout, read-only. Show "Included" instead of a zero.
- `PropertyContractsTab.tsx`: totals summary only counts Section B rows (`is_included_in_base_fee = false`) plus the flat-fee sibling row — matches how billing actually behaves today. Also fixes the hardcoded `$` (doc §7 item 1) by routing through `formatCurrency`.
- `VisitDetail.tsx` flat-fee detection: prefer `is_included_in_base_fee` on the linked line; fall back to the current sibling-row heuristic when the flag is unset. No behavior change for existing contracts.

### 6. Explicitly out of scope (called out so we don't confuse this with the bigger refactor)

- No auto-invoicing of overages. "Overage Price" is stored and displayed; the current invoice generation on visit completion stays unchanged. Auto-charging overages is a separate decision we should make before touching `finalizeVisit`.
- No `NOT NULL` on `unit_price`, no data rewrite of NULLs to 0.
- No new SSOT components extracted this pass — table sections live in `ContractDetail.tsx` and the read-only mirror in the two consumers above. Extraction to a shared `<ContractLineItemsTable>` is a good follow-up once the shape is stable.

## Technical notes

- Migration order per project rules: additive column + backfill in one migration, then app deploy.
- Types regen (`src/integrations/supabase/types.ts`) happens after the migration approves; the UI code lands in the same turn but the compiler will only see the new column post-approval.
- `getContractConsumption` needs no change — it already keys off `max_occurrences_per_period`, which now cleanly belongs to Section A only.
- i18n: add RO/EN strings for "Covered by Subscription", "Billed Separately", "Allowance Window", "Allowance Limit", "Overage Price", "Included Allowances", "Additional Billable Services".

## Risk summary

Low. The change is additive, the old NULL-based heuristic remains as a fallback, and no invoice/scheduling code paths are touched. The biggest UX risk is providers not understanding the new toggle — mitigated by putting the toggle first and hiding irrelevant fields per branch, exactly as the uploaded prompt suggests.

## Open questions before I build

1. **Overage Price behavior:** store-and-display only for this pass (my recommendation), or should exceeding the Allowance Limit auto-add a billable extra to the visit's invoice?
2. **`ContractNew.tsx` scope:** include the wizard refactor now (my recommendation, keeps the two entry points consistent), or ship only `ContractDetail.tsx` first and follow up?
3. **Client portal visibility:** should clients see the "Overage Price" column on Section A, or only see "Included, up to N / month"?
