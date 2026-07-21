
## Goal

Stop showing the `Flat fee — …` line under "Additional Billable Services". It represents the monthly/annual subscription price, not an add-on. Surface it as its own top-of-page section so the read order matches how the contract actually works:

1. **Subscription Fee** (the flat-fee sibling row)
2. **Included Allowances** (services covered by the subscription)
3. **Additional Billable Services** (true pay-per-visit extras — only shown when non-empty)

## Detection rule (shared)

A line is the "flat fee" sibling row when:
`typeof li.custom_name === "string" && li.custom_name.startsWith("Flat fee")`

It stays a single row created by `ContractNew` / `recreateFromOffer`; we're only changing where it renders.

## Changes

### 1. `src/pages/provider/ContractDetail.tsx`
- Partition `filtered` into `flatFeeRows`, `included`, `billed`. `billed` excludes flat-fee rows.
- Above the two existing tables, add a compact "Subscription Fee" section listing each flat-fee row with: Service label (`custom_name`), Billing cadence (`frequency_type` humanized, e.g. "per month"), and Amount (`formatCurrency(unit_price, currency)`). Keep the row's delete/edit affordances consistent with the other tables so providers can still adjust it.
- Update `billedTotal` to sum only true billable extras (unchanged math, just a smaller set).

### 2. `src/pages/client/ClientContractDetail.tsx`
- Same partition. Render a read-only "Subscription Fee" card at the top of the line-items area with the humanized cadence and `formatCurrency` amount.
- Remove flat-fee rows from `billedLines`. If nothing else remains, hide the "Additional Billable Services" card entirely (already conditional on `.length > 0`).

### 3. `src/components/provider/PropertyContractsTab.tsx`
- Totals already sum every non-included line, which correctly includes the flat-fee row — no math change. Only tweak the per-line summary list so the flat-fee row renders as "Subscription — {amount} / {cadence}" instead of the generic `qty × freq · price/unit` string.

### 4. i18n
Add EN/RO keys under the existing `entitlements` block and wire them in the three files above:
- `subscription_fee` / `Abonament lunar`
- `subscription_fee_note` / `Costul lunar al abonamentului — include alocările de mai jos`
- `billing_cadence.per_month` / `pe lună`, `per_year` / `pe an`, `one_time` / `unic`

(Reuse existing `included_allowances` / `additional_billable_services` keys.)

## Out of scope
- No schema changes; `is_included_in_base_fee` semantics untouched.
- No changes to invoice generation, `finalizeVisit`, or contract creation logic — the flat-fee row is still created the same way.
- No refactor of `ContractNew` line-item UI.

## Verification
- Contract with a `Flat fee — Regular Maintenance (Monthly)` row shows: top "Subscription Fee 400 RON / pe lună" card, then Included Allowances table, and the "Additional Billable Services" section is hidden (there are no true extras).
- Adding an ad-hoc billable line makes the "Additional Billable Services" table reappear with only that line.
- Client contract detail mirrors the same ordering.
- Property list summary shows "Subscription — 400 RON / pe lună" for the flat-fee row and keeps total unchanged.
