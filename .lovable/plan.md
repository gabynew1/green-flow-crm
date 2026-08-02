## Goal
On the customer Financial Summary, show a real Contract vs Ad-hoc split in Monthly Billing, and move the "Next automatic invoice" note to the Contracted value tile.

## Problem (verified)
The split is computed from the *invoice source* (`CONTRACT_CYCLE` vs other). Cycle invoices carry both the contract flat fee and extra ad-hoc services on the same invoice — e.g. the 550 RON invoice for this customer holds a `CONTRACT` flat-fee line plus a 200 RON `ADHOC` line — so everything lands in "Contract" and Ad-hoc always reads 0.

## Changes (frontend only, `src/components/provider/CustomerDashboard.tsx`)

1. **Fetch line-level data**: after loading invoices, fetch `invoice_line_items` (`invoice_id, line_group, line_total`) for those invoice IDs, in the same `loadInvoices` flow.
2. **Compute the split safely**, per invoice:
   - `contractPart` = sum of lines with `line_group = 'CONTRACT'` (many are 0.00 for included services — that is correct).
   - `adhocPart` = `invoice.total − contractPart`, clamped at 0, so the two chips always reconcile to the headline number even if line rows are missing or rounded.
   - If an invoice has no line rows at all, fall back to today's source-based classification.
3. **Apply to Monthly Billing and YTD Revenue** so both tiles use the same, consistent definition.
4. **Move the next-invoice note**: remove `Next automatic invoice {date} (draft)` from the Monthly Billing tile; render it in the Contracted value tile beneath the `N active contract · X / month` line.

## Risks / non-goals
- Headline totals, invoices, and PDFs are unchanged — only the breakdown and the note's placement.
- The "In draft (not yet invoiced)" figure stays a single total, not split.
- No database or trigger changes.
