# Database State — Billing, Contracts & Visits

Snapshot generated on **2 Aug 2026** directly from the live Lovable Cloud (Postgres/Supabase) database.
Intended as a briefing document for an external reviewing agent. Everything below is the *actual*
current state, not the intended design.

---

## 1. Table schemas

### 1.1 `public.contracts`

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| property_id | uuid | NO | — |
| contract_name | text | NO | — |
| start_date | date | NO | — |
| end_date | date | YES | — |
| **billing_cycle** | `billing_cycle` enum | NO | `'MONTHLY'` |
| **status** | `contract_status` enum | NO | `'DRAFT'` |
| created_at / updated_at | timestamptz | NO | `now()` |
| visit_frequency_count | integer | YES | `1` |
| visit_frequency_type | text | YES | `'WEEK'` |
| rejection_comment | text | YES | — |
| offer_id | uuid | YES | — |
| archived | boolean | NO | `false` |
| tenant_id | uuid | NO | — |
| **is_one_time_project** | boolean | NO | `false` |
| **next_invoice_date** | date | YES | — |

Key fields:
- **`billing_cycle`** — enum `MONTHLY | YEARLY | ONE_TIME`. Drives period bounds and cron eligibility.
- **`status`** — enum `DRAFT | SENT_TO_CLIENT | SIGNED | ACTIVE | CLOSED | REJECTED`. Only `ACTIVE`
  contracts are picked up by the invoice cron.
- **`is_one_time_project`** — the fixed-price project flag. When `true`, the recurring billing engine
  skips the contract entirely; invoicing goes through `fn_generate_invoice_for_project` instead.
- **`next_invoice_date`** — end of the current billing period; maintained by trigger
  `contracts_set_next_invoice_date` (fires `BEFORE INSERT OR UPDATE OF billing_cycle, start_date,
  is_one_time_project`) and rolled forward by the nightly cron. `NULL` for one-time / `ONE_TIME`.

### 1.2 `public.contract_line_items` (contract scope — relevant context)

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| contract_id | uuid | NO | — |
| service_catalog_id | uuid | NO | — |
| custom_name | text | YES | — |
| **frequency_type** | `frequency_type` enum | NO | `'PER_VISIT'` |
| quantity | numeric | NO | `1` |
| unit | text | YES | — |
| notes | text | YES | — |
| max_occurrences_per_period | integer | YES | — |
| unit_price | numeric | YES | — |
| tenant_id | uuid | NO | — |
| **is_included_in_base_fee** | boolean | NO | `false` |
| created_at / updated_at | timestamptz | NO | `now()` |

- **`frequency_type`** enum: `PER_VISIT | PER_WEEK | PER_MONTH | ONE_TIME | PER_YEAR | PER_CONTRACT`.
  Combined with `quantity` and contract length it produces the lifetime allowance shown in the visit UI
  (`consumed | allowance`).
- **`is_included_in_base_fee`** — entitlements model. `true` = covered by the flat monthly fee, so it
  bills at 0 on the visit and is excluded from project invoice scope lines.

### 1.3 `public.service_orders` (visits)

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| property_id | uuid | NO | — |
| contract_id | uuid | YES | — |
| scheduled_date | date | YES | — |
| performed_date | date | YES | — |
| period_type | `period_type` enum | NO | `'WEEK'` |
| period_label | text | YES | — |
| **status** | `service_order_status` enum | NO | `'SCHEDULED'` |
| notes | text | YES | — |
| client_summary | text | YES | — |
| created_by_user_id | uuid | YES | — |
| team_id | uuid | YES | — |
| scheduled_start_time / scheduled_end_time | time | YES | — |
| tenant_id | uuid | YES | — |
| needs_client_action | boolean | NO | `false` |
| cancel_reason | text | YES | — |
| checked_in_at | timestamptz | YES | — |
| created_at / updated_at | timestamptz | NO | `now()` |

- **`status`** enum: `SCHEDULED | IN_PROGRESS | COMPLETED | PENDING_APPROVAL | APPROVED |
  SENT_TO_CLIENT | CANCELED`. The transition **into** `COMPLETED` is the only billing trigger point.
- `period_type` enum: `WEEK | MONTH | ONE_TIME`.
- Visits with `contract_id IS NULL` are standalone/ad-hoc and get their own invoice.

### 1.4 `public.service_order_items`

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| service_order_id | uuid | NO | — |
| contract_line_item_id | uuid | YES | — |
| service_catalog_id | uuid | YES | — |
| name | text | NO | — |
| quantity | numeric | NO | `1` |
| unit | text | YES | — |
| notes | text | YES | — |
| **source** | `service_order_item_source` enum | NO | `'CONTRACT'` |
| **is_completed** | boolean | NO | `false` |
| unit_price | numeric | YES | — |
| tenant_id | uuid | NO | — |
| created_at / updated_at | timestamptz | NO | `now()` |

- **`source`** enum: `CONTRACT | AD_HOC`. `CONTRACT` items consume the contract allowance and bill at 0
  under a flat fee; `AD_HOC` items are always billable extras.
- **`is_completed`** — ticked by the provider for contract items. As of the current build, ad-hoc items
  are inserted with `is_completed = true` and have **no checkbox in the UI** (a mistake is deleted, not
  unticked). All historical ad-hoc rows on non-canceled visits were backfilled to `true`.

### 1.5 `public.invoices`

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| tenant_id | uuid | NO | — |
| customer_id | uuid | NO | — |
| contract_id | uuid | YES | — |
| property_id | uuid | YES | — (FK `invoices_property_id_fkey` → `properties.id`) |
| invoice_number | text | YES | assigned by `assign_invoice_number()` on issue |
| **period_start / period_end** | date | YES | — |
| issue_date | date | NO | `CURRENT_DATE` |
| due_date | date | NO | `CURRENT_DATE + 14 days` |
| subtotal / total | numeric | NO | `0` (recomputed by line triggers) |
| currency | text | NO | `'RON'` |
| **status** | `invoice_status` enum | NO | `'DRAFT'` |
| **source** | `invoice_source` enum | NO | `'MANUAL'` |
| paid_at | timestamptz | YES | — |
| notes | text | YES | — |
| created_by_user_id | uuid | YES | — |
| service_order_id | uuid | YES | — |
| created_at / updated_at | timestamptz | NO | `now()` |

- **`status`** enum: `DRAFT | ISSUED | PAID | OVERDUE | CANCELED`.
- **`source`** enum: `CONTRACT_CYCLE | ADHOC | MANUAL`.
- `period_start` is the bucketing key used by the provider dashboards (falls back to `issue_date`).

### 1.6 `public.invoice_line_items`

| Column | Type | Null | Default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| invoice_id | uuid | NO | — |
| tenant_id | uuid | NO | — |
| contract_line_item_id | uuid | YES | — |
| service_order_id | uuid | YES | — |
| service_order_item_id | uuid | YES | — |
| description | text | NO | — |
| quantity | numeric | NO | `1` |
| unit_price | numeric | NO | `0` |
| line_total | numeric | NO | `0` (computed by `trg_line_compute`) |
| **line_group** | text | NO | `'CONTRACT'` |
| created_at | timestamptz | NO | `now()` |

- **`line_group`** is `'CONTRACT'` or `'ADHOC'` and drives the two separate tables (with subtotals and a
  grand total) in the invoice UI and PDF.

---

## 2. Current invoice trigger logic

### 2.1 Trigger wiring

```sql
CREATE TRIGGER service_orders_invoice_sync
  AFTER UPDATE OF status ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION trg_service_orders_invoice_sync();
```

```sql
CREATE OR REPLACE FUNCTION public.trg_service_orders_invoice_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
    BEGIN
      PERFORM public.fn_generate_invoice_for_visit(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- never block visit completion; record the failure instead
      INSERT INTO public.activity_log (
        property_id, tenant_id, event_type, event_description,
        related_entity_type, related_entity_id
      ) VALUES (
        NEW.property_id, NEW.tenant_id, 'invoice_generation_failed',
        'Generarea facturii a eșuat pentru vizită: ' || SQLERRM,
        'service_order', NEW.id
      );
    END;
  ELSIF OLD.status = 'COMPLETED' AND NEW.status IS DISTINCT FROM 'COMPLETED' THEN
    DELETE FROM public.invoices
     WHERE service_order_id = NEW.id AND status = 'DRAFT';
    DELETE FROM public.invoice_line_items
     WHERE service_order_id = NEW.id AND line_group = 'ADHOC'
       AND invoice_id IN (SELECT id FROM public.invoices WHERE status = 'DRAFT');
  END IF;
  RETURN NEW;
END; $$;
```

### 2.2 `fn_generate_invoice_for_visit(_service_order_id uuid) RETURNS uuid`

`SECURITY DEFINER`, `search_path = public`. Verbatim behaviour:

```sql
CREATE OR REPLACE FUNCTION public.fn_generate_invoice_for_visit(_service_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_visit record; v_customer_id uuid; v_tenant_id uuid; v_contract_id uuid;
  v_currency text; v_performed_date date; v_invoice_id uuid;
BEGIN
  SELECT so.*, pr.customer_id AS cust_id, pr.tenant_id AS ten_id
    INTO v_visit
    FROM public.service_orders so
    JOIN public.properties pr ON pr.id = so.property_id
   WHERE so.id = _service_order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_customer_id    := v_visit.cust_id;
  v_tenant_id      := COALESCE(v_visit.tenant_id, v_visit.ten_id);
  v_contract_id    := v_visit.contract_id;
  v_performed_date := COALESCE(v_visit.performed_date, v_visit.scheduled_date, CURRENT_DATE);
  IF v_customer_id IS NULL OR v_tenant_id IS NULL THEN RETURN NULL; END IF;

  -- One-time projects are invoiced via fn_generate_invoice_for_project
  IF v_contract_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contracts c
     WHERE c.id = v_contract_id AND (c.is_one_time_project OR c.billing_cycle = 'ONE_TIME')
  ) THEN
    RETURN NULL;
  END IF;

  IF v_contract_id IS NOT NULL THEN
    -- Recurring contract: APPEND-ONLY into the period's cycle invoice
    v_invoice_id := public.fn_ensure_cycle_invoice(v_contract_id, v_performed_date);
    IF v_invoice_id IS NULL THEN RETURN NULL; END IF;
  ELSE
    -- Standalone visit: reuse or create its own ADHOC draft
    SELECT id INTO v_invoice_id
      FROM public.invoices
     WHERE service_order_id = _service_order_id AND status = 'DRAFT' LIMIT 1;

    IF v_invoice_id IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.service_order_items soi
                      WHERE soi.service_order_id = _service_order_id) THEN
        RETURN NULL;
      END IF;
      SELECT currency INTO v_currency FROM public.tenants WHERE id = v_tenant_id;
      INSERT INTO public.invoices (
        tenant_id, customer_id, property_id, service_order_id,
        period_start, period_end, issue_date, due_date,
        currency, status, source, notes
      ) VALUES (
        v_tenant_id, v_customer_id, v_visit.property_id, _service_order_id,
        v_performed_date, v_performed_date, v_performed_date,
        v_performed_date + INTERVAL '14 days',
        COALESCE(v_currency, 'RON'), 'DRAFT', 'ADHOC',
        'Draft generat automat la finalizarea vizitei.'
      ) RETURNING id INTO v_invoice_id;
    END IF;
  END IF;

  INSERT INTO public.invoice_line_items (
    invoice_id, tenant_id, service_order_item_id, service_order_id,
    description, quantity, unit_price, line_group
  )
  SELECT v_invoice_id, v_tenant_id, soi.id, _service_order_id,
         COALESCE(soi.name, sc.name, 'Serviciu suplimentar'),
         COALESCE(soi.quantity, 1), COALESCE(soi.unit_price, 0), 'ADHOC'
    FROM public.service_order_items soi
    LEFT JOIN public.service_catalog sc ON sc.id = soi.service_catalog_id
   WHERE soi.service_order_id = _service_order_id
     AND (soi.source = 'AD_HOC' OR v_contract_id IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_line_items ili
        WHERE ili.invoice_id = v_invoice_id AND ili.service_order_item_id = soi.id
     );

  -- Drop an empty standalone draft we just created
  IF v_contract_id IS NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoice_line_items WHERE invoice_id = v_invoice_id
  ) THEN
    DELETE FROM public.invoices WHERE id = v_invoice_id;
    RETURN NULL;
  END IF;

  RETURN v_invoice_id;
END; $$;
```

**In plain words:** completing a visit never creates a *contract* invoice by itself. For a recurring
contract it resolves (or lazily creates) the single cycle invoice for the period the visit falls in and
appends only the `AD_HOC` items as `ADHOC` line items, de-duplicated by `service_order_item_id`. For a
standalone visit it creates/reuses one `ADHOC` draft tied to `service_order_id`. One-time projects are
skipped. Reverting a visit out of `COMPLETED` removes the draft/ad-hoc lines again.

### 2.3 Supporting functions

- **`fn_contract_period_bounds(_contract_id, _ref_date)`** → `(period_start, period_end)`.
  `MONTHLY` = calendar month of `_ref_date`; `YEARLY` = anniversary window anchored on `start_date`;
  returns `NULL` for one-time / `ONE_TIME`.
- **`fn_ensure_cycle_invoice(_contract_id, _period_start)`** → idempotent. Returns the existing
  non-`CANCELED` `CONTRACT_CYCLE` invoice for the period, or creates a `DRAFT` (issue = `period_end`,
  due = `period_end + 14 days`) and inserts the base contract scope lines once, `line_group='CONTRACT'`.
- **`fn_generate_due_cycle_invoices()`** → loops `ACTIVE`, non-one-time contracts with
  `next_invoice_date <= CURRENT_DATE`, calls `fn_ensure_cycle_invoice`, then rolls `next_invoice_date`
  forward to the next period end. Per-contract failures raise a `WARNING` and do not abort the loop.
- **`fn_generate_invoice_for_project(_contract_id)`** → one-time projects only. Authorization-checked
  (caller tenant must match, or super admin). Emits contract scope lines (excluding
  `is_included_in_base_fee`) plus every delivered `AD_HOC` item across the project's visits.
- **`fn_recompute_invoice_status(_invoice_id)`** → drives `PAID` / `ISSUED` / `OVERDUE` from
  `invoice_payments`; never overrides `CANCELED`.

Other billing-adjacent triggers currently active:

| Trigger | Table | Purpose |
|---|---|---|
| `contracts_set_next_invoice_date` | contracts | maintains `next_invoice_date` |
| `invoice_line_compute` | invoice_line_items | computes `line_total` |
| `invoice_lines_recompute` | invoice_line_items | recomputes invoice `subtotal`/`total` |
| `invoice_payments_recompute` | invoice_payments | recomputes invoice status |
| `invoices_assign_number` | invoices | assigns `invoice_number` on issue |
| `invoices_touch` | invoices | `updated_at` |
| `service_orders_invoice_sync` | service_orders | the visit → invoice hook above |

---

## 3. Unique indexes

Current indexes on `public.invoices`:

```sql
CREATE UNIQUE INDEX invoices_pkey
  ON public.invoices USING btree (id);

CREATE UNIQUE INDEX invoices_tenant_number_uidx
  ON public.invoices USING btree (tenant_id, invoice_number)
  WHERE (invoice_number IS NOT NULL);

CREATE UNIQUE INDEX invoices_service_order_draft_uidx
  ON public.invoices USING btree (service_order_id)
  WHERE ((service_order_id IS NOT NULL) AND (status = 'DRAFT'::invoice_status));

-- THE contract-cycle guard
CREATE UNIQUE INDEX invoices_contract_period_uidx
  ON public.invoices USING btree (contract_id, period_start)
  WHERE ((contract_id IS NOT NULL)
     AND (period_start IS NOT NULL)
     AND (source = 'CONTRACT_CYCLE'::invoice_source)
     AND (status <> 'CANCELED'::invoice_status));

-- non-unique
CREATE INDEX invoices_tenant_status_idx  ON public.invoices (tenant_id, status);
CREATE INDEX invoices_customer_idx       ON public.invoices (customer_id, status);
CREATE INDEX invoices_service_order_idx  ON public.invoices (service_order_id)
  WHERE (service_order_id IS NOT NULL);
```

Yes — the constraint is **`invoices_contract_period_uidx`**, and it is a *partial* unique index. The
`status <> 'CANCELED'` predicate is deliberate: a canceled invoice must not block regenerating the same
billing period (this was a real production bug).

Related guard on visits:

```sql
CREATE UNIQUE INDEX service_orders_contract_date_team_unique
  ON public.service_orders (contract_id, scheduled_date, team_id)
  WHERE (contract_id IS NOT NULL AND scheduled_date IS NOT NULL
     AND team_id IS NOT NULL AND status <> 'CANCELED');
```

---

## 4. Cron jobs

Billing is **not** 100% trigger-based. There is exactly one active invoice cron (`pg_cron`):

| jobid | name | schedule | command | active |
|---|---|---|---|---|
| 19 | `generate-cycle-invoices` | `30 2 * * *` (02:30 daily) | `SELECT public.fn_generate_due_cycle_invoices();` | yes |

All other active cron jobs, for completeness (none touch invoices):

| jobid | name | schedule | command |
|---|---|---|---|
| 6 | `expire-trials-daily` | `0 2 * * *` | `SELECT public.expire_trials_to_patio();` |
| 7 | `expire-stale-action-tasks` | `15 1 * * *` | `SELECT public.expire_stale_action_tasks();` |
| 8 | `notify-contract-renewals` | `30 1 * * *` | `SELECT public.notify_contract_renewals();` |
| 9 | `purge-email-logs-daily` | `0 3 * * *` | `SELECT public.purge_old_email_logs();` |
| 15 | `lifecycle-email-drip` | `*/15 * * * *` | `net.http_post` → `lifecycle-email-drip` edge function |
| 16 | `lifecycle-hourly` | `15 * * * *` | `net.http_post` → `lifecycle-cron` edge function |

### Division of responsibility (current model)

| Concern | Owner |
|---|---|
| Creating the recurring cycle draft + base scope lines | cron `generate-cycle-invoices` → `fn_ensure_cycle_invoice` (lazily also created by a visit if the period draft doesn't exist yet) |
| Appending ad-hoc extras | `service_orders_invoice_sync` trigger on visit `COMPLETED` |
| One-time project invoices | manual, provider-initiated `fn_generate_invoice_for_project` RPC |
| Issuing / numbering | `invoices_assign_number` on status change to `ISSUED` |
| Payment status (`PAID` / `OVERDUE`) | `invoice_payments` triggers → `fn_recompute_invoice_status` |

### Known sharp edges worth a reviewer's attention

1. `fn_generate_due_cycle_invoices` rolls `next_invoice_date` forward **even if** the invoice creation
   raised (the exception handler only warns), so a persistent failure silently skips a period.
2. `fn_ensure_cycle_invoice` inserts **all** contract line items as base scope lines, including
   `is_included_in_base_fee = true` rows — unlike `fn_generate_invoice_for_project`, which excludes them.
   That asymmetry is intentional-looking but unverified.
3. `fn_ensure_cycle_invoice` and `fn_generate_invoice_for_visit` have no caller-tenant authorization
   check (they run from triggers/cron); `fn_generate_invoice_for_project` does.
4. The de-dup in `fn_generate_invoice_for_visit` is scoped to `invoice_id`, whereas
   `fn_generate_invoice_for_project` de-dups across all non-canceled invoices.