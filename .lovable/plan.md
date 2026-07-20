## Invoice list/detail improvements + Outstanding tile on Customer Financial Summary

### 1. Whole-row click → invoice detail (Billing.tsx)
The row already navigates on click, but inner `<Link>` cells stop propagation. Clean it up:
- Keep `onClick` on `TableRow` navigating to `/provider/invoices/:id`; add `hover:bg-muted/40`.
- Remove inner `<Link>` wrappers on invoice number / customer / contract columns — plain styled text — so clicking anywhere on the row (except the Actions cell) opens the invoice.
- Keep `stopPropagation` on the Actions cell so Emite / Încasat / PDF still work standalone.

### 2. Download PDF
Add a "Descarcă PDF" button on `InvoiceDetail.tsx` for any non-DRAFT invoice, plus a small PDF icon-button in the Actions column of `Billing.tsx` rows (non-DRAFT).
- Deps: `jspdf`, `jspdf-autotable`.
- New `src/lib/invoice-pdf.ts` exporting `generateInvoicePdf(invoice, lines, tenant, customer)`:
  - Header: tenant company_name, CUI, address.
  - Bill-to: customer company_name / name, CUI/CNP, address.
  - Meta: invoice number, issue date, due date, period.
  - Table: description, qty, unit price, line total.
  - Footer: subtotal / total, notes, "Generat din GreenGrassCRM".
  - Filename: `Factura-${invoice_number}.pdf`.
- `InvoiceDetail.tsx` fetches tenant header once on load and passes it to the helper.

### 3. Audit trail for "Marchează încasat"
`invoice_payments.recorded_by_user_id` already exists but is never populated. Fix it and surface it.

- Update both `markPaid` call sites (`Billing.tsx`, `InvoiceDetail.tsx`) to include `recorded_by_user_id: user.id`.
- DB safety net (migration):
  - `BEFORE INSERT` trigger that sets `recorded_by_user_id = auth.uid()` when NULL.
  - `BEFORE UPDATE` trigger blocking changes to `recorded_by_user_id`.
  - `AFTER INSERT` trigger writing an `activity_log` row (`action = 'invoice.marked_paid'`, metadata: amount, method, payment_id) so it appears in the tenant activity feed no matter which code path recorded the payment.
- `InvoiceDetail.tsx`: when PAID, show an "Încasat de {full_name} · {paid_at}" line under the total (join `profiles` on `recorded_by_user_id`).

### 4. New "De încasat" tile on Customer Financial Summary
On each customer's dashboard (`src/components/provider/CustomerDashboard.tsx`), add a fourth tile to the Financial Summary card:
- Label: "De încasat" (outstanding).
- Value: sum of `invoices.total` where `customer_id = <this customer>` AND `status IN ('ISSUED','OVERDUE')` (i.e. everything issued and not yet paid — includes restanțe by definition). Sub-label shows the restanțe subset: "din care X RON restanțe" using invoices with `status='OVERDUE' OR (status='ISSUED' AND due_date < today)`.
- Style: red/amber tone when > 0, muted when 0.
- Clickable: wrap the tile in a `Link` to `/provider/billing?customer=<id>&status=OVERDUE`. `Billing.tsx` reads these URL params on mount:
  - `customer` → pre-fills a customer filter (currently only free-text search exists — extend `search` OR add a dedicated `customerId` state and disable the search box while active, showing a removable chip "Client: <name>").
  - `status=OVERDUE` → sets `statusFilter` to `OVERDUE`.
- Data source: reuse the existing `invoices` fetch already in `CustomerDashboard.loadInvoices` (fetches this year's invoices for the customer). Widen the query if needed to include all unpaid invoices regardless of year — outstanding shouldn't be YTD-scoped.

### Technical section

**Files to edit**
- `src/pages/provider/Billing.tsx` — unwrap inner Links; read `customer` and `status` URL params; add customer-filter chip; add per-row PDF icon; pass `user.id` to markPaid.
- `src/pages/provider/InvoiceDetail.tsx` — Download PDF button; fetch tenant header + payments + recorder profile; show audit line; pass `user.id` to markPaid.
- `src/components/provider/CustomerDashboard.tsx` — add "De încasat" tile linking to filtered billing view; widen invoice query to include all unpaid rows.
- `src/lib/invoice-pdf.ts` — new jsPDF helper.

**Migration**
```sql
CREATE OR REPLACE FUNCTION public.set_invoice_payment_recorder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recorded_by_user_id IS NULL THEN
    NEW.recorded_by_user_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_payments_set_recorder
BEFORE INSERT ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_payment_recorder();

CREATE OR REPLACE FUNCTION public.lock_invoice_payment_recorder()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id THEN
    RAISE EXCEPTION 'recorded_by_user_id is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_payments_lock_recorder
BEFORE UPDATE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_payment_recorder();

CREATE OR REPLACE FUNCTION public.log_invoice_payment_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (NEW.tenant_id, NEW.recorded_by_user_id, 'invoice.marked_paid', 'invoice', NEW.invoice_id,
          jsonb_build_object('amount', NEW.amount, 'method', NEW.method, 'payment_id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER trg_invoice_payments_activity_log
AFTER INSERT ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.log_invoice_payment_activity();
```

**Deps**: `bun add jspdf jspdf-autotable`.

### Out of scope
- Server-side PDF rendering / fully branded template beyond a clean basic layout.
- e-Factura XML export.
- Partial payments UI (still one-click full amount as today).
