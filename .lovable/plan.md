## Goal

Support "one-time project" contracts end to end: mark the checkbox at creation, deliver the work, mark the project **Completed**, send the client a completion report, then generate **one** invoice from the contract. Ad-hoc visits/requests added during the project appear on that invoice in a clearly separated table, with three totals: contract services, ad-hoc services, grand total.

## 1. The flag (not yet built)

The "One-time project" checkbox from the previous request still needs a real home.

- Migration: add `contracts.is_one_time_project boolean not null default false`.
- `ContractNew.tsx`: checkbox under the Start/End date pickers labelled **One-time project** with helper text "Fixed-price project — one visit cycle, billed once." When ticked, Visit frequency is forced to `1 per Contract` and Billing cycle to `Ad hoc` (`ONE_TIME`), both controls greyed out/disabled; unticking restores the editable defaults. The flag is saved on the contract.
- `ContractDetail.tsx` shows a "One-time project" badge next to the status badge.

## 2. Project lifecycle (only for one-time contracts)

Lifecycle stays inside the existing `contract_status` enum — no new enum values:

```text
DRAFT → SENT_TO_CLIENT → SIGNED → ACTIVE → (Mark project completed) → CLOSED
```

On an `ACTIVE` one-time contract, the action bar replaces the recurring-contract actions with:

1. **Mark project completed** — confirmation dialog listing open (non-completed) visits; blocks only if a visit is still `IN_PROGRESS`, otherwise warns. Sets status `CLOSED` and records completion via the existing `close_contract_with_cleanup` path so leftover scheduled visits are cleaned up and logged.
2. **Send completion report to client** — enabled once completed. Uses the existing Resend pipeline (`sendAppEmail` + `process-email-queue`) with a new `project-report` template registered in `registry.ts` under the `contracts_offers` category. The email summarises the project: contract services delivered (consumed counts), ad-hoc extras, the two subtotals and grand total, plus a link to the contract in the client portal.
3. **Generate invoice** — enabled once completed; creates (or opens, if it already exists) the single project invoice.

These three appear as a small stepper so the intended order is obvious; each step is enabled by the previous one but the invoice step is not hard-blocked on the report being sent.

## 3. Invoice generation for a one-time project

New RPC `fn_generate_invoice_for_project(_contract_id uuid) returns uuid`, SECURITY DEFINER, `search_path = public`, granted to `authenticated` and `service_role`, tenant-checked against the caller's `get_user_tenant_id()`.

Behaviour:
- Idempotent: if an invoice already exists for the contract with `source = 'CONTRACT_CYCLE'`, return it.
- Header: `period_start` = contract start, `period_end` = contract end, `issue_date` = today, `due_date` = +14 days, currency from tenant, status `DRAFT`.
- **Contract lines**: one line per `contract_line_items` row (description, quantity, unit price) — same as today's cycle function.
- **Ad-hoc lines**: every `service_order_items` row with `source = 'AD_HOC'`, `is_completed = true`, on `service_orders` for this contract (including visits converted from `visit_requests`) whose status is `COMPLETED`/`APPROVED`/`SENT_TO_CLIENT`. Priced from `service_order_items.unit_price`.
- Double-billing guard: skip any ad-hoc item whose `service_order_id` already has an `ADHOC` invoice, and make `fn_generate_invoice_for_visit` skip visits belonging to a one-time contract.
- Existing `trg_line_compute` / `invoice_lines_recompute` triggers keep `line_total`, `subtotal` and `total` correct — no totals maths in the client.

To distinguish the two groups on the invoice, add `invoice_line_items.line_group text not null default 'CONTRACT'` (values `CONTRACT` / `ADHOC`).

## 4. Invoice presentation (three totals)

`InvoiceDetail.tsx` (provider), `ClientBilling.tsx` / client invoice view, and `invoice-pdf.ts` all render:

```text
Contract services            [table]
  Subtotal — contract services            X
Additional / ad-hoc services [separate table, labelled "Extra work outside the contract"]
  Subtotal — additional services          Y
─────────────────────────────────────────
GRAND TOTAL                              X + Y
```

If there are no ad-hoc lines the second table and its subtotal are hidden and only the grand total shows. Wording is translated in `en`/`ro` locale files. The PDF uses two `autoTable` blocks with the same three-line total block.

## 5. Ad-hoc work stays open during the project

No change to how ad-hoc visits and client visit requests are created against a one-time contract — they continue to work while the contract is `ACTIVE`. Only after **Mark project completed** are they frozen (matching the existing closed-contract behaviour), so the invoice reflects a stable scope.

## Technical summary

- Migration: `contracts.is_one_time_project`, `invoice_line_items.line_group`, new `fn_generate_invoice_for_project`, guard in `fn_generate_invoice_for_visit`.
- Frontend: `ContractNew.tsx` (checkbox), `ContractDetail.tsx` (badge + 3-step action bar + dialogs), `InvoiceDetail.tsx`, client invoice/billing views, `src/lib/invoice-pdf.ts`, locale JSON.
- Email: new `project-report` transactional template + registry entry (Resend pipeline only).
- `TEST_PLAN.md`: add a "One-time project" scenario covering create → deliver → ad-hoc extra → complete → report → invoice with split totals.

## Open assumption

Ad-hoc pricing uses `service_order_items.unit_price`; items with no price are invoiced at 0 and flagged in the completion dialog so you can fill them in before invoicing.
