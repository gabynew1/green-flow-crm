# Visit-to-invoice visibility

## How it works today

```text
Active maintenance contract (MONTHLY billing)
        |
        |-- next_invoice_date reached  --> nightly job  --> DRAFT cycle invoice
        |                                                   (CONTRACT lines,
        |                                                    zero-cost lines excluded)
        |
Scheduled visit completed --> trigger --> ad-hoc items appended to that SAME
                                          draft cycle invoice (ADHOC lines)
```

- When a visit on a recurring contract is marked complete, the ad-hoc lines are
  attached to the contract's draft invoice for that period. If no draft exists yet
  for the period, one is created on the spot.
- The invoice stays in **Draft** until someone issues it from Billing. Nothing is
  sent to the client automatically.
- Standalone visits (no contract) get their own separate ad-hoc draft invoice.
- One-time projects are excluded — those are invoiced from the contract page.

## The gap (confirmed)

The visit page looks for its invoice with `invoices.service_order_id = <visit>`.
For contract-cycle invoices that column is empty — the link lives on the line
items instead. Result, on recurring-contract visits:

- The "Draft invoice created" toast after completion never fires.
- The **Download / Share -> Invoice** action is unavailable because no invoice is
  linked.
- The provider sends the report to the client and sees no sign that money is now
  sitting on a pending draft.

Checked against live data: recent completed contract visits have ad-hoc lines on a
draft invoice while the visit itself reports zero linked invoices.

## What to build

1. **Resolve the invoice correctly on the visit page.** Look the invoice up
   through its line items (`invoice_line_items.service_order_id`) and fall back to
   `invoices.service_order_id`. This alone restores the toast and the invoice
   download/share for contract visits.

2. **Persistent billing panel on the visit page** (replaces relying on a toast the
   user may miss). Shown whenever the visit has ad-hoc items or a linked invoice:
   - Ad-hoc total for this visit.
   - Status of the invoice it landed on: Draft / Issued / Paid, its number, and
     whether it is a monthly cycle invoice or a standalone one.
   - For a cycle invoice: the period it covers and the fact that it will be issued
     with the rest of the month.
   - A direct link to the invoice.
   - When there are no billable extras: a plain "Nothing to invoice for this visit"
     line, so the absence is explicit rather than ambiguous.

3. **Confirm before completing.** The "Complete and send report" confirmation gains
   a short billing summary: "This adds <amount> in extra services to the <month>
   draft invoice for <contract>." So the decision is made with the cost visible,
   not discovered afterwards.

4. **Draft invoices need attention on Billing.** The Billing page already counts
   drafts; add a dismissible banner listing drafts whose period has ended and are
   still unissued, linking straight to each. This is the safety net for the
   original concern: nothing sits pending forever without a nudge.

## Technical notes

- Frontend only, plus one read query change. No schema change, no trigger change.
- `src/pages/provider/VisitDetail.tsx`: invoice lookup via `invoice_line_items`,
  new billing panel, completion-dialog summary.
- `src/pages/provider/Billing.tsx`: stale-draft banner from the invoices already
  loaded there.
- Amount shown on the visit is the sum of this visit's ad-hoc lines, not the whole
  invoice total, so it never misleads about what this visit contributed.
- All new strings go through the existing i18n setup (Romanian default).
