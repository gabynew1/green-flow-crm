# UAT Walkthrough: Visit → Services → Ad-hoc → Report → Invoice

A step-by-step script to validate the simplified delivery-to-cash flow. No code changes — this is a test script. Run it once for a standalone visit (Path A) and once for a contract-linked visit (Path B).

## Prep
- Log in as a provider (full admin) with at least one active customer.
- Have a customer with an active recurring maintenance contract available for Path B.

## Step 1 — Create the visit
1. Provider → Visits → "Create Visit".
2. Customer: type at least 3 characters, pick the customer.
3. Property: the dropdown lists that customer's active properties. If none exist, choose "No specific location".
4. Pick the date, then either a preset time slot or a custom HH:MM–HH:MM range.
5. Save.

Expect: visit created with status Scheduled and visible in Day/Week/Month calendar view in the right slot.

## Step 2 — Check in
1. Open the visit → "Check-In" → confirm.

Expect: status becomes In Progress, client receives a check-in email, toast confirms.

## Step 3 — Deliver contract services (Path B only)
1. In the Services section, tick each service actually delivered.
2. Note the consumption counter per line (e.g. `2 | 24` = consumed vs total contract allocation), sorted by largest allocation first.

Expect: contract lines included in the base fee show 0 cost; consumption advances after completion.

## Step 4 — Add ad-hoc cost
1. Click "Ad-hoc Service".
2. Search the catalog or type a custom name, set quantity and unit price, add.

Expect: item appears under "Ad-hoc Services" with an AD_HOC badge, always counted as delivered, price included in the visit total.
Edge case: an item priced 0 should warn that it will be invoiced at 0.

## Step 5 — Complete & send report
1. Click "Complete & Send Report" → review the dialog summary → confirm.

Expect:
- Status flips to Completed (not stuck In Progress) and performed date is set.
- Visit becomes read-only; no reopen.
- Client receives the report email.
- Calendar shows the visit on its performed date.

## Step 6 — PDF / share
1. In the completed banner, click "Download PDF" (and "Share" on mobile).

Expect: filename follows `Vendor_Property_ServiceType_Date`, not a generic name. Content lists delivered services and the ad-hoc table separately.

## Step 7 — Invoice
Path A (no contract):
1. From the completed visit, open the linked invoice.

Expect: one DRAFT invoice of source ADHOC linked to this visit, containing only priced lines (zero-cost lines excluded).

Path B (contract):
1. From the completed visit, follow the billing link to the cycle invoice.

Expect: the ad-hoc items are appended to the open DRAFT cycle invoice for the contract rather than creating a second invoice; the invoice separates contract amount vs ad-hoc amount, plus grand total.

## Step 8 — Payment
1. Open the invoice → "Mark paid".

Expect: no database error, status becomes Paid, and the customer dashboard tiles update: Contract value, YTD Revenue, Invoiced, Pending Invoices, Monthly Billing (with contract/ad-hoc split and next automatic invoice date).

## Pass criteria
- No visit stuck In Progress after completion.
- Exactly one invoice per path — no duplicates.
- Contract vs ad-hoc amounts always separated and summing to the grand total.
- Currency values rounded up to whole units in the tenant currency.
- All UI strings appear in the selected language.

## Notes
- Record any failure as a new regression step in `TEST_PLAN.md`.