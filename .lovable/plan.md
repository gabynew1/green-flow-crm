## Billing engine — corrected plan

### 1. Fix the constraint, no date hacking
- Drop and recreate the unique index so canceled invoices no longer block regeneration:
  `CREATE UNIQUE INDEX invoices_contract_period_uidx ON public.invoices (contract_id, period_start) WHERE contract_id IS NOT NULL AND period_start IS NOT NULL AND source = 'CONTRACT_CYCLE' AND status <> 'CANCELED';`
- `period_start` keeps its true meaning: the first day of the billing period (month start for MONTHLY, contract-year start for YEARLY). No synthetic dates.

### 2. One owner for invoice creation
- **Cron / period logic is the only creator.** New `fn_ensure_cycle_invoice(contract_id, period_start)`: creates the DRAFT `CONTRACT_CYCLE` invoice for the period with the base subscription/flat-fee contract lines (`line_group = 'CONTRACT'`). Idempotent — returns the existing draft if present.
- **Visit trigger becomes append-only.** Rewrite `fn_generate_invoice_for_visit`:
  - Recurring contract → look up the open (non-canceled) cycle invoice for the visit's period; if none exists yet, call `fn_ensure_cycle_invoice` once (same code path, no duplicate logic), then append only the visit's ad-hoc lines (`line_group = 'ADHOC'`). It never re-adds contract lines.
  - No contract (pure ad-hoc visit) → unchanged: its own `ADHOC` invoice.
  - One-time projects → unchanged (handled by `fn_generate_invoice_for_project`).
- Replace the silent `RAISE WARNING` in `trg_service_orders_invoice_sync` with an `activity_log` entry (`event_type = 'invoice_generation_failed'`, error text in the description) so failures are visible on the property timeline.
- Data repair: the two visits completed today on `Mentenanta _test 2` get their ad-hoc line appended to the August draft, and the stuck CANCELED invoice no longer blocks it.

### 3. Ad-hoc extras: no checkboxes
- In `VisitDetail.tsx`, ad-hoc lines added during a visit render without a completion checkbox — they are always treated as delivered.
- Each ad-hoc line gets a **Delete** action that removes the `service_order_items` row entirely (with confirm). Mistakes are deleted, never stored as unchecked.
- Migration backfill: set `is_completed = true` on all existing `AD_HOC` items on non-canceled visits, so no orphan "unchecked" rows remain (this immediately bills the 200 RON consulting line on today's visit).
- Contract services keep their checkboxes — those record what was delivered against scope.

### 4. Dashboard on real data
`src/components/provider/CustomerDashboard.tsx`:
- Bucket invoices by billing **period** (`period_start` / `period_end`, falling back to `issue_date`) instead of `issue_date` only, so an August draft counts in August.
- **Monthly Billing** and **YTD Revenue** keep issued/paid as the headline number, plus a distinct sub-line: "In draft (not yet invoiced): X" fed by DRAFT invoices.
- Drop the fabricated `getAdHocItemCount` approximation; contract/ad-hoc splits come from `invoice_line_items.line_group`.
- Relabel projections: "Total Contract Value" → "Contracted value" and monthly projection → "Contracted / month", so they read as commitments, not revenue.
- Monthly Billing card shows "Next automatic invoice: 31 Aug 2026 (draft)" when an active recurring contract exists.

### 5. Billing date on contracts
- Add `contracts.next_invoice_date date`, computed from `billing_cycle`: end of the current month (MONTHLY) or end of the contract year (YEARLY); `NULL` for `ONE_TIME` / one-time projects. Set on insert and on activation via trigger; backfill existing ACTIVE recurring contracts.
- `ContractNew.tsx` and `ContractDetail.tsx` show a read-only line under Billing cycle: "Next invoice: 31 Aug 2026" (greyed out when one-time project is ticked).
- New `fn_generate_due_cycle_invoices()` + daily `cron.schedule` at 02:30: for every ACTIVE recurring contract with `next_invoice_date <= today`, call `fn_ensure_cycle_invoice` for the closing period and roll `next_invoice_date` forward one cycle. Drafts are never auto-issued — the provider reviews and issues from `/provider/billing`.

### 6. Regression coverage in `TEST_PLAN.md`
- Two visits completed in one month on a monthly contract → exactly one cycle invoice, base fee once, both ad-hoc extras appended.
- Cancel a cycle invoice, complete another visit → new draft generated cleanly (index no longer blocks).
- Add an ad-hoc service, then delete it → row gone from `service_order_items`, not billed.
- Cron run on a contract whose `next_invoice_date` passed → draft exists, date rolled forward, running twice creates nothing extra.

## Technical notes
- Migrations: re-create `invoices_contract_period_uidx`; add `fn_ensure_cycle_invoice`, `fn_generate_due_cycle_invoices`; rewrite `fn_generate_invoice_for_visit` and `trg_service_orders_invoice_sync`; add `contracts.next_invoice_date` + backfill + cron job; ad-hoc `is_completed` backfill.
- Frontend: `CustomerDashboard.tsx`, `VisitDetail.tsx`, `ContractNew.tsx`, `ContractDetail.tsx`.
