## Goal

When the selected category in **New Contract** is **Regular Maintenance**, switch the contract from per-line-item pricing to a single **flat fee per billing cycle**. Other categories (Garden Landscaping, Irrigation, Special & Seasonal, Design & Consulting) keep the existing per-service pricing UI.

## Behavior changes (Regular Maintenance only)

1. **Catalog table** — keep search, select-all, and the full details (code, name, description, unit). Hide the "Default price" column since pricing is no longer per-service.
2. **Per-service configuration cards** — hidden entirely. No frequency, quantity, unit price, or max/period inputs.
3. **New "Flat fee" block** — appears once at least one Regular Maintenance service is selected:
   - One amount input (`flatFee`) labelled e.g. *"Flat fee per Monthly billing cycle"* (label updates with the chosen `billingCycle`: Monthly / Yearly / Ad hoc).
   - Helper text: *"Covers all selected services for each billing cycle. Visits are scheduled per the cadence above."*
4. **Summary panel (right column)** — shows `Flat fee: 1,200 RON / month` instead of a service count price.
5. **Save logic** — for Regular Maintenance:
   - Insert the contract row as today.
   - Insert one `contract_line_items` row per selected service with:
     - `quantity = 1`, `unit_price = NULL`, `frequency_type` derived from billing cycle (`MONTHLY → PER_MONTH`, `YEARLY → PER_YEAR`, `ONE_TIME → ONE_TIME`).
   - Insert one extra "flat fee" line item:
     - `service_catalog_id` = a sentinel (the first selected service) so the FK stays valid, `custom_name = "Flat fee — Regular Maintenance"`, `unit_price = flatFee`, `quantity = 1`, `frequency_type` matching billing cycle, `notes = "Flat fee covering: <comma-joined service names>"`.
   - This keeps reporting consistent with the existing scope-tracking model without a schema change.

## Validation

- Flat fee is required and must be > 0 (toast otherwise).
- At least one Regular Maintenance service must still be selected.
- Per-service unit-price validation is skipped in flat-fee mode.

## Out of scope

- No DB migration. Schema unchanged; flat fee is represented via a dedicated line item.
- Other categories continue with the current per-service flow.
- Contract detail/edit pages remain untouched in this pass (flat fee shows as a normal line item there).

## Technical notes

- File touched: `src/pages/provider/ContractNew.tsx` only.
- Add `const isFlatFeeMode = selectedCategory === "Regular Maintenance"` and branch the JSX + `handleCreate` on it.
- Add state `const [flatFee, setFlatFee] = useState("")` reset whenever `selectedCategory` changes.
- Hide the "Default price" `<th>`/`<td>` and adjust the empty-state `colSpan` from 6 to 5 when in flat-fee mode.
- Reuse `<CurrencyInput>` and `useTenantCurrency()` for the flat-fee input.
