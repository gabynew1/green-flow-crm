## Unified Visit Action Row + Strict State Machine (v2)

Single shared component drives every visit interaction — list rows AND the detail page — so the rules can't drift across surfaces.

### Architecture check

- Mutation surfaces confirmed: `VisitDetail.tsx` (status Select + Complete + Delete), `RescheduleVisitButton.tsx`, `VisitRow.tsx` (quick-cancel — currently broken because `cancel_reason` column doesn't exist), `GenerateNext30Dialog.tsx` (bulk insert, out of scope). Calendar `ServiceVisits.tsx` navigates to detail; no inline editor. `ClientVisitDetail.tsx` is read-only.
- Current status counts: SCHEDULED 137, CANCELED 147, COMPLETED 11, no legacy states — hygiene UPDATE is a defensive no-op today.
- No architectural blockers.

### 1. New shared component — `src/components/visits/VisitActionRow.tsx`

Buttons are rendered **contextually by status** (revised per feedback — no upfront noise):

| Status         | Buttons rendered (in order)                             |
| -------------- | ------------------------------------------------------- |
| SCHEDULED      | Check-In · Reschedule · Complete · Cancel Visit         |
| IN_PROGRESS    | Complete · Cancel Visit                                 |
| COMPLETED      | *(none — terminal)*                                     |
| CANCELED       | Rebook · Delete Visit                                   |

Within a status, buttons that exist are always enabled (no disabled ghosts). Rebook and Delete only appear when `status === 'CANCELED'`.

Props:
```ts
{
  visit: { id, status, scheduled_date, scheduled_start_time, scheduled_end_time,
           property_id, customer_id, contract_id, tenant_id,
           properties?: { name, customers?: { name, email } } };
  onChanged: () => void | Promise<void>;
  onComplete?: () => void;          // detail page passes its report flow; lists omit
  size?: "sm" | "default";          // sm = compact icon buttons for list rows
  layout?: "row" | "detail";
}
```

Handlers (all live inside `VisitActionRow`, reused everywhere):

- **Check-In** — `AlertDialog` "Confirm check-in? This notifies the client." → `update({status:'IN_PROGRESS', checked_in_at: now()})` → `sendAppEmail({templateName:'visit-checkin', idempotencyKey:'visit-checkin-<id>', templateData:{propertyName, providerName, timestamp}, tenantId})`. Toast "Checked in — client notified".
- **Reschedule** — reuses `RescheduleVisitButton`'s date-picker popover internally.
- **Complete** — calls `onComplete` when provided (detail page's existing report-generation flow, too coupled to inline line-item state to extract this pass). List rows omit the prop, so Complete simply isn't rendered there — matches user's "click into detail to complete" ergonomics.
- **Cancel Visit** — `AlertDialog` with optional `<Textarea>` reason (default `"Canceled by provider"`) → `update({status:'CANCELED', cancel_reason})` → toast with Undo (10s) that restores prior status + nulls reason.
- **Rebook** — opens `CreateAdHocVisitDialog` prefilled with this visit's customer, property, and line items via new `initialVisit` prop. Save = fresh `service_orders` insert; original CANCELED row untouched.
- **Delete Visit** — `AlertDialog` "This cannot be undone." → hard `delete().eq('id', ...)`.

### 2. Wiring — replaces every ad-hoc control

- **`VisitDetail.tsx`** — remove the status `Select` and `changeStatus`; keep the status pill in the top-right as a read-only `Badge`. Under the header: `<VisitActionRow visit layout="detail" onComplete={handleComplete} onChanged={refetch} />`. Remove the standalone bottom Delete button (now inside the action row, gated to CANCELED).
- **`VisitRow.tsx` (quick actions in lists — YES, covered)** — replace the two inline icon buttons (`RescheduleVisitButton` + `XCircle` quick-cancel) with `<VisitActionRow visit={o} size="sm" onChanged={onChanged} />`. Same enable rules apply, so:
  - SCHEDULED rows show: Check-In · Reschedule · Cancel (compact icons; Complete only on detail).
  - IN_PROGRESS rows show: Cancel.
  - CANCELED rows show: Rebook · Delete.
  - COMPLETED rows show no action icons.
  - Fixes the currently-broken quick-cancel (writes the now-existing `cancel_reason` column).
- **`ServiceVisits.tsx`, `CustomerDetail.tsx`, `PropertyVisitsTab.tsx`** — all render through `VisitRow`, so they inherit the new quick actions with no page edits.
- **`CreateAdHocVisitDialog.tsx`** — accept optional `initialVisit?: {customer_id, property_id, items[]}` prop for Rebook prefill; existing manual-create path unchanged.

### 3. Migration

```sql
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
```

No RLS/GRANT changes — inherits existing policies.

### 4. Email template

- New `supabase/functions/_shared/transactional-email-templates/visit-checkin.tsx` mirroring `visit-report.tsx`. Props: `propertyName`, `providerName`, `timestamp`. Subject: `"Your service provider has arrived"`.
- Register in `registry.ts` (`TEMPLATES` + `TEMPLATE_CATEGORY = 'visits'`).
- Redeploy `send-transactional-email`.

### 5. Data hygiene (via insert tool, not migration)

```sql
UPDATE public.service_orders
SET status = 'SCHEDULED', needs_client_action = false
WHERE status IN ('PENDING_APPROVAL','APPROVED','SENT_TO_CLIENT')
  AND scheduled_date >= CURRENT_DATE;
```

### Non-goals
- Extracting the Complete-and-send-report flow out of `VisitDetail` (line-item coupling — future refactor).
- Client-portal UI changes (client just receives the new check-in email).

### Files touched
- **New:** `src/components/visits/VisitActionRow.tsx`, `supabase/functions/_shared/transactional-email-templates/visit-checkin.tsx`.
- **Edit:** `src/pages/provider/VisitDetail.tsx`, `src/components/provider/visits/VisitRow.tsx`, `src/components/provider/CreateAdHocVisitDialog.tsx`, `supabase/functions/_shared/transactional-email-templates/registry.ts`, `src/i18n/locales/{ro,en}/provider.json`.
- **Migration:** `cancel_reason`, `checked_in_at` on `service_orders`.
- **Insert tool:** legacy-status normalization.
- **Deploy:** `send-transactional-email`.
