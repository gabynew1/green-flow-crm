## Goal

Make every sales-pipeline event flow through one consistent notification surface:

- **Approvals & "needs your attention"** → land in **Tasks** (existing page) as `pending` rows with Approve/Reject actions.
- **Scheduled visits** (Inspection now, Service Visits later) → land in a new **Schedule** tab inside Tasks, AND require client confirmation before they "lock in".
- **All of the above** → also fire the **Notification Bell** (top-right) in real time.

Currently only `link_request` (connection) and `inspection_confirmation` types create `action_tasks`. Sending an Offer or Contract just flips a status and emails the client — nothing shows up in the client's Tasks page. Inspection scheduling today only sends an email (no confirmation task). This plan closes those gaps.

## Event matrix (after this change)

```text
Sales pipeline event                 Initiator → Recipient   Surface
-----------------------------------  ----------------------  ----------------------------
Provider sends Offer to client       Provider → Client       Tasks (offer_response) + Bell
Client Accept / Reject offer         Client   → Provider     Tasks status update + Bell
Provider sends Contract to client    Provider → Client       Tasks (contract_response) + Bell
Client Accept / Reject contract      Client   → Provider     Tasks status update + Bell
Provider schedules Inspection        Provider → Client       Schedule tab + Bell
                                                             (action: inspection_confirmation)
Client confirms / declines insp.     Client   → Provider     Tasks status update + Bell
Contract auto-renewal due            System   → Provider     Tasks (contract_renewal) + Bell
Connection (link) request            Client   → Provider     Tasks (link_request) + Bell  [unchanged]
```

## Changes

### 1. Database (one migration)

- Update `_apply_task_side_effects` so that on `approve` / `reject` of:
  - `offer_response` → flips `offers.status` (already there for accept; add reject path consistency).
  - `contract_response` → flips `contracts.status` to `ACTIVE` / `REJECTED` (already there).
  - `inspection_confirmation` → on approve, set `inspections.status = 'SCHEDULED'`; on reject, revert to `DRAFT` and store the rejection comment in `inspections.notes`.
- Add two helper RPCs (called by the provider UI) so emitting these tasks is one line:
  - `emit_offer_response_task(offer_id)` — looks up client user from `properties.customer_id`, builds payload `{ offer_id, property_id, total_value, valid_until }`, calls `create_action_task(task_type='offer_response', target_user_id=<client>, ...)`.
  - `emit_contract_response_task(contract_id)` — analogous, payload `{ contract_id, property_id, contract_name, start_date, end_date }`.
  - (`inspection_confirmation` is already emittable; we just start using it from the UI.)
- Add a DB trigger guard: when `offers.status` transitions DRAFT/IN_PROGRESS → `SENT_TO_CLIENT`, auto-call `emit_offer_response_task` (idempotent via existing `notification_dedupe`). Same for `contracts.status` → `SENT_TO_CLIENT`. This way the client always sees a Task even if a future flow sets the status from elsewhere.
- Tighten dedupe key: `offer-response-<offer_id>`, `contract-response-<contract_id>`, `inspection-confirmation-<inspection_id>` so re-sending the same artifact does not double-task.

### 2. Provider UI

- `src/pages/provider/OfferDetail.tsx` — keep the existing email send; remove now-redundant manual logic and rely on the trigger to create the action_task. (No visible change for provider.)
- `src/pages/provider/ContractDetail.tsx` — same.
- `src/pages/provider/InspectionDetail.tsx` — when scheduling, in addition to the email, call `createActionTask({ task_type: 'inspection_confirmation', target_user_id: <client_user>, subject_entity_type: 'inspection', subject_entity_id, payload: { inspection_id, property_id, scheduled_date } })`. Show a small "Awaiting client confirmation" badge on the inspection card while the task is pending.

### 3. Client UI — Tasks page

`src/pages/tasks/TasksPage.tsx`

- Add a new top-level **view switcher** above the existing category pills:
  - **Tasks** (current inline table — approvals, comments, link requests).
  - **Schedule** (new) — calendar/list of scheduled-visit tasks.
- The `inspection_confirmation` task type renders in **both** views while pending: in Tasks for the action button, and in Schedule with date/property so the client sees it on a calendar grid.
- Once approved, it disappears from Tasks (becomes "done" under the existing filter) but stays on Schedule as a confirmed scheduled visit (read from `inspections.status='SCHEDULED'`).
- Add `inspection_confirmation` to `TYPE_LABEL` (already there) and the new view filter.
- Schedule view: month-grid (`date-fns` + simple Tailwind grid; no new dep). Each cell shows confirmed inspections (green) and pending-confirmation ones (amber). Clicking a pill opens the same right-side detail panel as Tasks.

### 4. Notification bell

No structural change. The bell already subscribes to `user_notifications` and `_emit_notification` is invoked inside `create_action_task` and `act_on_task`, so adding the new task emissions in step 1 means the bell automatically pings for every pipeline event listed in the matrix.

### 5. Backfill

One-shot SQL in the migration: for every `offers.status='SENT_TO_CLIENT'` and `contracts.status='SENT_TO_CLIENT'` that has no matching pending action_task, insert one. So existing in-flight items show up in Tasks immediately after deploy.

## Out of scope (called out so we don't sprawl)

- Service Visits confirmations — same `inspection_confirmation` pattern can be extended later via a `visit_confirmation` task type. Schedule view is built generically so it picks them up when added.
- Reordering / drag-drop in Schedule view — read-only this iteration.
- Calendar `.ics` export — possible follow-up.

## Files touched

- `supabase/migrations/<new>_pipeline_tasks_and_schedule.sql` (new)
- `src/pages/provider/InspectionDetail.tsx`
- `src/pages/tasks/TasksPage.tsx`
- `src/pages/tasks/ScheduleView.tsx` (new component, imported by TasksPage)
- `src/hooks/useActionTasks.ts` (no change expected; hook already returns what we need)
