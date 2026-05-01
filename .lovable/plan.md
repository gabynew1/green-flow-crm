## Goal

Replace the current one-click "Close" on a contract with a confirmed, end-of-day cancellation flow that requires a written reason, deletes only future visits (after today in tenant timezone), writes an immutable audit record, and notifies in-app only — no email.

## Schema changes (one migration)

1. **`tenants.timezone TEXT NOT NULL DEFAULT 'Europe/Bucharest'`** — sensible default given the app's RO compliance focus. Used to compute "today".
2. **`notification_kind` enum** — add value `'contract_closed'` (lowercase, matching existing convention like `contract_signed`).
3. **New table `contract_closure_events`** (audit log, append-only):
   - `id uuid pk default gen_random_uuid()`
   - `contract_id uuid not null`
   - `tenant_id uuid not null`
   - `closed_by_user_id uuid not null`
   - `closed_on_local_date date not null` (the businessDate / new end_date)
   - `closed_at_utc timestamptz not null default now()`
   - `reason text not null check (length(btrim(reason)) > 0)`
   - `canceled_visits_count integer not null default 0`
   - `canceled_visits_snapshot jsonb not null default '[]'::jsonb` (array of `{id, scheduled_date, status, period_label}`)
   - `created_at timestamptz not null default now()`
   - **RLS**: providers SELECT/INSERT where `tenant_id = get_user_tenant_id(auth.uid())` and `is_provider(...)`; no UPDATE/DELETE policies (immutable audit).
4. **RPC `close_contract_with_cleanup(_contract_id uuid, _reason text)`** — `security definer`, runs in one transaction:
   - Resolve actor `auth.uid()`, tenant via `get_user_tenant_id`.
   - Authorize: contract belongs to caller's tenant and caller `is_provider`.
   - Load contract; if `status = 'CLOSED'` → return `{ already_closed: true, canceled_count: 0, closed_on: end_date }` (idempotent no-op).
   - Compute `_business_date := (now() AT TIME ZONE tenant.timezone)::date`.
   - Select future visits: `service_orders WHERE contract_id = _contract_id AND scheduled_date > _business_date`. Build snapshot JSON.
   - Insert `contract_closure_events` row (logging happens before deletion).
   - Delete those `service_orders` (cascades to `service_order_items` via existing FK or explicit delete in same TX).
   - Update contract: `status = 'CLOSED'`, `end_date = LEAST(coalesce(end_date, _business_date), _business_date)` (only moves earlier or sets if null — never extends beyond `_business_date`; simpler: `end_date = _business_date` if `end_date IS NULL OR end_date > _business_date`).
   - Insert `user_notifications` rows for: (a) the resolved client profile user (via `properties.customer_id → profiles.user_id`), and (b) every other provider profile in the tenant (`tenant_id = X AND user_id != actor`). Deduplicate `user_id`s. Idempotency guard: skip insert if a row with same `(user_id, kind='contract_closed', entity_id=_contract_id)` already exists.
   - Return `jsonb { canceled_count, closed_on, reason, already_closed: false }`.

Doing the mutation server-side in one RPC guarantees atomicity and authoritative timezone math.

## Client code changes

### `src/lib/contracts.ts` (new)
Thin wrapper:
```ts
export async function closeContractWithCleanup(contractId: string, reason: string) {
  const { data, error } = await supabase.rpc('close_contract_with_cleanup', {
    _contract_id: contractId, _reason: reason.trim(),
  });
  if (error) throw error;
  return data as { canceled_count: number; closed_on: string; already_closed: boolean };
}

export async function countFutureVisits(contractId: string, tenantTimezone: string) {
  const today = /* compute today in tenantTimezone using Intl */;
  const { count } = await supabase
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contractId)
    .gt('scheduled_date', today);
  return { count: count ?? 0, today };
}
```

### `src/components/provider/CloseContractDialog.tsx` (new, shared)
Controlled `AlertDialog` containing:
- Title: **Contract closed**
- Body: `Closing will end this contract on {today}. {N} future visit(s) scheduled after today will be cancelled. A cancellation reason is required. Continue?`
- `Textarea` with label **Cancellation reason** (required, trimmed, min length 1).
- Confirm button disabled until reason is non-empty; calls `closeContractWithCleanup`, shows toast `Contract closed. {N} future visit(s) cancelled. Contract ends on {today}.`, then calls `onClosed()` for parent reload.
Props: `{ contractId, open, onOpenChange, onClosed }`. Internally fetches tenant timezone + future-visit count when opened.

### `src/pages/provider/ContractDetail.tsx`
- In `updateStatus`, when `status === 'CLOSED'`: do NOT directly update — open the new dialog instead (track `closeOpen` state). All other transitions unchanged.
- The existing Close button at line 441 toggles `closeOpen=true`.
- After successful close, call existing `load()`.

### `src/pages/provider/CustomerDetail.tsx`
- In the inline Close button (line ~356), instead of calling `updateContractStatus(c.id, 'CLOSED')`, open the shared dialog with that contract id; on success call `load()`. Other status transitions in `updateContractStatus` are untouched.

## Acceptance mapping

1. Reason required → dialog disables confirm + RPC `CHECK length > 0`.
2. End-of-day → `end_date = businessDate`.
3. `end_date` set to businessDate.
4. Today's visits untouched → filter is `scheduled_date > businessDate`.
5. After-today visits deleted regardless of status → no status filter.
6. Deleted visits gone from UI → hard delete from `service_orders`.
7. Audit captured → `contract_closure_events` row inserted before delete with snapshot + reason + actor.
8. Internal notification with simplified copy → kind `contract_closed`, body `The contract "{name}" and all related future visits have been cancelled.`
9. No email → no `sendAppEmail` call anywhere in this flow.
10. Idempotent → early return when status already `CLOSED`; notification dedupe by `(user_id, kind, entity_id)`.
11. Both pages share the dialog + helper.
12. Other status transitions untouched.

## Out of scope
Invoices, credit notes, email templates, reopen-restoration, tenant-timezone admin UI (default value is sufficient; can be exposed later).
