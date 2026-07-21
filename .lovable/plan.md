
Ship Steps 1 and 3 only. Defer Step 2 (ContractNew parity) until we're ready to extract a shared line-item component used by Contract, ContractNew, and Offer together.

## Step 1 — VisitDetail flat-fee heuristic

File: `src/pages/provider/VisitDetail.tsx` (around lines 107–115).

Change the `contractFlatFee` detection so it prefers the flag on the linked contract line:

- If the visit's linked `contract_line_items` row has `is_included_in_base_fee === true`, treat it as flat-fee-covered.
- Otherwise fall back to the current "Flat fee —" sibling-row heuristic for legacy contracts where the flag is null.

No changes to `finalizeVisit`, invoice generation, or pricing math — only the display heuristic that drives the "Included in flat fee" labels.

## Step 3 — i18n strings

Add EN and RO entries and route the corresponding literals in `ContractDetail.tsx` and `ClientContractDetail.tsx` through `useTranslation`:

- `Pricing Model` / `Model de tarifare`
- `Covered by Subscription` / `Inclus în abonament`
- `Billed Separately` / `Facturat separat`
- `Allowance Window` / `Interval alocare`
- `Allowance Limit` / `Limită alocare`
- `Overage Price` / `Preț depășire`
- `Included Allowances` / `Alocări incluse`
- `Additional Billable Services` / `Servicii facturate suplimentar`

Use the existing translation loader / keys convention already in the repo.

## Out of scope

- ContractNew UI parity (deferred to a future shared-component pass).
- Invoice generation, `finalizeVisit`, schema changes, `NOT NULL` on `unit_price`.
- Offer modals.

## Verification

- Build passes.
- A contract line with `is_included_in_base_fee = true` and no "Flat fee —" sibling row shows "Included in flat fee" on the visit detail page.
- Switching the UI to RO shows translated labels on Contract detail screens (provider + client).
