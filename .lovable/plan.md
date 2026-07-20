## Goal

When a visit is marked **COMPLETED**, auto-generate a **DRAFT invoice** that combines the contract's fixed charges + any ad-hoc items delivered on that visit. The provider reviews, adjusts if needed, and clicks **Issue** to send it. The Financial Summary card then reflects real invoiced/collected numbers instead of fake projections.

## Business rules

1. **Trigger** — every time a `service_orders` row transitions to `status = 'COMPLETED'`, exactly one draft invoice per completion is created.
2. **Fixed portion (from contract)** — one line per `contract_line_items` row scoped to that visit:
   - `PER_VISIT` → billed at `unit_price × quantity` for this visit.
   - `PER_WEEK` / `PER_MONTH` → billed only on the **first completed visit of that period** (week / calendar month), then skipped until the next period. Prevents duplicate charges when a fixed-fee contract has multiple visits per month.
   - `ONE_TIME` → billed only on the first ever completed visit of the contract.
3. **Ad-hoc portion (from the visit itself)** — one line per `service_order_items` row where `is_completed = true` AND `source = 'ADHOC'` (not tied to a contract line). Priced at the item's `unit_price × quantity`.
4. **Empty invoices are skipped** — if no fixed line qualifies (period already billed) and no ad-hoc items were delivered, no invoice is created.
5. **Status flow** — `DRAFT` (auto) → provider clicks **Issue** → `ISSUED` (customer-visible, notification email sent) → `PAID` (when a payment is recorded) or `OVERDUE` (past due date). Provider can also `CANCELED`.
6. **Idempotency** — re-completing the same visit (uncomplete → complete again) must not create a second draft; reuse or restore the existing draft.
7. **Un-completing a visit** — if a visit is moved back out of `COMPLETED`, its **DRAFT** invoice is deleted; **ISSUED/PAID** invoices are left alone (already sent to customer — provider must void manually).

## UX

- **Visit completion dialog** — after the provider marks the visit complete, show a toast "Draft invoice created · Review" with a link to the new invoice. If skipped (rule 4), show "No invoice generated · already billed this period".
- **Invoice detail page** — add an **Issue Invoice** button (visible only on `DRAFT`). On click: set `issue_date = today`, `due_date = today + tenant default net-days` (default 14), status `ISSUED`, send `contract-sent`-style notification email to the customer. Provider can edit line items, quantities, prices, and notes while `DRAFT`.
- **Provider Billing dashboard** — no structural change; new drafts show up in the existing "Drafts" filter.
- **Customer Dashboard Financial Summary** — replace the fake projection tiles with real invoice-based numbers (see next section).

## Financial Summary card — real numbers

`src/components/provider/CustomerDashboard.tsx`

- **Total Contract Value** — keep the current forward-looking calc, relabel sublabel as "contracted".
- **Monthly Billing** — sum of `invoices.total` for this customer where `issue_date` is in the current month AND `status IN ('ISSUED','PAID','OVERDUE')`. Split into Contract (`source='CONTRACT_CYCLE'`) vs Ad-hoc (`source='ADHOC'` or MANUAL). Drafts excluded.
- **YTD Revenue** — two numbers side by side:
  - **Collected** = `SUM(invoice_payments.amount)` for invoices of this customer in the current year.
  - **Invoiced** = `SUM(invoices.total)` for `status IN ('ISSUED','PAID','OVERDUE')` in the current year.
  - Same Contract vs Ad-hoc split.
- Empty state: "No invoices yet" when zero rows.

Delete `monthlyContractValue * now.getMonth()` (line 335) entirely.

## Technical section

### 1. Database migration

- Add `service_order_id UUID REFERENCES service_orders(id)` to `public.invoices` + partial unique index `(service_order_id) WHERE service_order_id IS NOT NULL AND status='DRAFT'` for idempotency.
- Add `billed_period_key TEXT` to `public.contract_line_items` — not used; instead track billing at the invoice line level via existing `contract_line_item_id` on `invoice_line_items` + the invoice's `period_start`/`period_end`. So: no new column, we check "has this contract line already been billed for the period containing this visit's performed_date?" against `invoice_line_items` joined to `invoices`.
- New SECURITY DEFINER function `public.fn_generate_invoice_for_visit(p_service_order_id uuid) returns uuid` — encapsulates rules 1–4 & 6, returns the invoice id (or NULL if skipped). Callable from an AFTER UPDATE trigger on `service_orders` when status transitions to `COMPLETED`, and manually from the "Regenerate draft" button.
- New trigger `trg_service_orders_after_complete` — calls the function.
- New trigger on `service_orders` for un-complete transitions → deletes DRAFT invoice tied to that `service_order_id`.
- `GRANT EXECUTE` on the function to `authenticated` (used by the frontend regenerate button) and `service_role`.
- Invoice numbering: use existing pattern (check current logic; if none, `INV-YYYY-NNNN` per tenant with a sequence table).

### 2. Frontend changes

- `src/pages/provider/InvoiceDetail.tsx` (create or extend existing): add "Issue Invoice" and "Regenerate from visit" actions, editable line items while DRAFT.
- `src/components/provider/CompleteVisitDialog.tsx` (or wherever the complete action lives): after the mutation succeeds, read the returned invoice id and toast + link.
- `src/components/provider/CustomerDashboard.tsx`: load `invoices` + `invoice_payments` for the customer, compute the four aggregates above, rewrite the three tiles.
- `src/pages/provider/Billing.tsx`: verify draft invoices appear in the Drafts filter (should — no change needed).

### 3. Email

- Reuse the existing transactional-email pipeline. Add one new template `invoice-issued` (customer-facing, RO + EN) triggered by the Issue button. Do NOT trigger on DRAFT creation.

## Out of scope

- Auto-issuing invoices (always requires provider approval).
- Recurring cron-based invoicing for contracts with no visits (that's a different model; current design is visit-driven).
- PDF export & e-Factura submission (existing separate work).
- Partial payments UI beyond what already exists in `invoice_payments`.
