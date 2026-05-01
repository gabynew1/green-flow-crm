# Tasks / Pending Actions + Notifications System

Build a tenant-aware, auditable system that:
1. Manages **actionable tasks** requiring approve/reject (link requests, offer/contract responses, renewals).
2. Emits **informational notifications** for lifecycle events (inspection scheduled, offer sent, contract signed, renewal due, feedback received) — surfaced in the same bell/badge/notifications center.

Both flows share one global badge, one notifications drawer, and one unified Tasks page filtered by "Actions required" vs "Activity".

Naming note: existing `public.tasks` (provider operational to-dos, unused in code) stays untouched. New tables use `action_*` prefix.

---

## Priority 1 — Must-have

### 1. Database schema (one migration)

**Approval/decision workflows (`action_tasks`):**
- `action_tasks` — `id`, `tenant_id`, `task_type`, `status` (`pending`|`approved`|`rejected`|`cancelled`|`expired`), `initiator_user_id`, `initiator_role`, `target_user_id` (nullable = any provider admin in tenant), `target_role`, `subject_entity_type` (`offer`|`contract`|`inspection`|`property`|`tenant`), `subject_entity_id`, `payload jsonb`, `due_at`, `created_at`, `updated_at`.
- `action_task_events` — immutable audit (`created`|`approved`|`rejected`|`cancelled`|`expired`|`commented`).
- `action_task_comments` — threaded comments per task.

Initial `task_type` set:
- `link_request` — client requests to share property with provider.
- `offer_response` — client must accept/reject an offer (mirrors current SENT_TO_CLIENT state).
- `contract_response` — client must accept/reject a contract.
- `inspection_confirmation` — client confirms a scheduled inspection date.
- `contract_renewal` — provider must approve/reject auto-generated renewal of an expiring contract.

**Informational stream (`user_notifications`):**
- `id`, `tenant_id`, `user_id`, `kind`, `title`, `body`, `entity_type`, `entity_id`, `task_id` (nullable — set when paired with an action_task), `read_at`, `created_at`.

`kind` values include both action-paired (`task_created`, `task_approved`, `task_rejected`, `task_commented`) and pure informational:
- `inspection_scheduled`, `inspection_completed`
- `offer_sent`, `offer_accepted`, `offer_rejected`
- `contract_sent`, `contract_signed`, `contract_rejected`, `contract_expiring_soon`, `contract_renewed`
- `feedback_received`
- `connection_approved`, `connection_revoked`

Explicitly **excluded** from notifications (per user request): scheduled service visits (`service_orders`). Visit completion / report delivery may notify in a follow-up iteration if requested.

**Indexes:** `(tenant_id, status)`, `(tenant_id, target_user_id, status)`, `(tenant_id, initiator_user_id)` on `action_tasks`; `(user_id, read_at, created_at desc)` on `user_notifications`.

**RLS:** SELECT scoped to tenant + (initiator OR target OR provider-admin-when-target-null). Mutations only via `SECURITY DEFINER` RPCs. Realtime enabled on `user_notifications` and `action_tasks`.

### 2. SECURITY DEFINER RPCs

- `create_action_task(_task_type, _tenant_id, _target_user_id, _target_role, _subject_entity_type, _subject_entity_id, _payload, _due_at)` — inserts task + `created` event + notifies target(s). Honours per-tenant auto-approve flags (e.g. `auto_approve_link_requests`).
- `act_on_task(_task_id, _action, _comment)` — RBAC-checked; updates status, writes event + optional comment, notifies initiator. Side effects per `task_type`:
  - `link_request` approve → insert `client_connections`, set `properties.tenant_id`.
  - `offer_response` approve/reject → update `offers.status`.
  - `contract_response` approve/reject → update `contracts.status`.
  - `inspection_confirmation` approve → mark inspection `SCHEDULED` confirmed.
  - `contract_renewal` approve → clone contract with new dates.
- `add_task_comment(_task_id, _body)`.
- `mark_notifications_read(_ids uuid[])`, `mark_all_read()`.

### 3. Database triggers — informational notifications

Triggers fan out `user_notifications` rows automatically (no UI code change needed at the trigger sites):

- `offers` AFTER INSERT/UPDATE OF status →
  - on `SENT_TO_CLIENT`: notify client (+ create `offer_response` task).
  - on `ACCEPTED`/`REJECTED`: notify provider creator.
- `contracts` AFTER INSERT/UPDATE OF status →
  - on `SENT_TO_CLIENT`: notify client (+ create `contract_response` task).
  - on `ACTIVE`/`SIGNED`: notify both sides.
- `inspections` AFTER UPDATE OF status →
  - on `SCHEDULED`: notify client (+ create `inspection_confirmation` task with `due_at = inspected_date`).
  - on `COMPLETED`: notify client.
- `feedback` AFTER INSERT → notify provider tenant admins.
- `client_connections` AFTER UPDATE OF status → notify both sides.

### 4. Scheduled jobs (pg_cron)

- `expire_stale_tasks()` — daily; flips overdue `pending` tasks to `expired` and notifies initiator.
- `notify_contract_renewals()` — daily; for `contracts` where `end_date` falls in the next 30/14/7 days and `archived = false`, emit `contract_expiring_soon` notification to provider admins (deduped by `(contract_id, day-bucket)` via a lightweight `notification_dedupe` table) and create one `contract_renewal` action task at the 14-day mark.

### 5. Frontend

**Hooks**
- `src/hooks/useNotifications.ts` — query `user_notifications` for current user; subscribe via Supabase Realtime; expose `unreadCount`, `items`, `markRead`, `markAllRead`.
- `src/hooks/useActionTasks.ts` — `pendingForMe`, `mineInitiated` queries; reuses notifications channel.

**Global header bell + badge**
Mounted in `ProviderLayout` and `ClientLayout` headers. Popover shows last 10 notifications grouped: "Action required" (linked to task detail) and "Activity" (linked to subject entity). "View all" → `/tasks` (role-routed).

**Unified Tasks / Notifications page**
- Provider route: `/provider/tasks` (added to `ProviderSidebar`).
- Client route: `/client/tasks` (added to `ClientLayout` nav).
- Two tabs: **Action Required** (action_tasks where current user is target, status=pending) and **Activity** (user_notifications, all kinds).
- Filters: status, type, date, direction. Detail panel renders payload per `task_type` (e.g. `LinkRequestPayload`, `OfferResponsePayload`) and shows comments + audit timeline.
- Approve/Reject modals — reject requires comment.

**Link-request rewrite (`ClientConnect.tsx`)**
Replace direct `client_connections` insert + `properties.tenant_id` update with a single `create_action_task('link_request', …)` call. Toast: "Request sent — awaiting provider approval."

**Auto-approve setting**
Tenant settings page (`provider/Settings`) gains a "Auto-approve client link requests" toggle writing `tenants.feature_flags.auto_approve_link_requests`.

### 6. Tests & rollout

- Vitest: hooks (mocked Supabase) for unread count, mark-read, realtime-trigger refetch.
- SQL leak test script (`scripts/test_task_isolation.ts`): seed two tenants; assert each tenant cannot SELECT/UPDATE the other's tasks/notifications as either role.
- Trigger smoke test: insert offer → assert notification + task rows for the client.
- Feature flag `VITE_FEATURE_TASKS=1` gates routes + bell mount; default ON in preview.

---

## Priority 2 — Should-have

- `action_task_attachments` table + `task-attachments` Storage bucket.
- Outbound webhooks (`task.created/updated/completed`, `notification.emitted`) via edge function reading a `tenant_webhooks` table.
- Email channel: reuse existing PGMQ + `process-email-queue` with new `task-action-required` and `activity-digest` (daily digest) templates.
- Per-tenant application-level encryption for `payload` sensitive fields (pgsodium + tenant key column).
- Per-user notification preferences (`notification_preferences` table: kind × channel toggle).

## Priority 3 — Nice-to-have

- Admin RBAC matrix UI per `task_type` × role.
- Per-tenant task quotas + admin bulk approve/reject.
- Export audit trail (CSV).
- OpenAPI generation.

---

## Technical details

### Files to create
- `supabase/migrations/<ts>_action_tasks_and_notifications.sql` — tables, RLS, RPCs, lifecycle triggers on `offers`/`contracts`/`inspections`/`feedback`/`client_connections`, pg_cron schedules, realtime publication.
- `src/hooks/useNotifications.ts`, `src/hooks/useActionTasks.ts`.
- `src/components/notifications/NotificationBell.tsx`, `NotificationPopover.tsx`.
- `src/components/tasks/TaskList.tsx`, `TaskDetailPanel.tsx`, `TaskActionDialog.tsx`, `payloads/{LinkRequest,OfferResponse,ContractResponse,InspectionConfirmation,ContractRenewal}Payload.tsx`.
- `src/pages/tasks/TasksPage.tsx` (shared, role-aware).
- `scripts/test_task_isolation.ts`.

### Files to edit
- `src/App.tsx` — add `/provider/tasks` and `/client/tasks` routes (feature-flagged).
- `src/components/provider/ProviderLayout.tsx` + `ProviderSidebar.tsx` — header bell, sidebar entry.
- `src/components/client/ClientLayout.tsx` — header bell, nav entry.
- `src/pages/client/ClientConnect.tsx` — switch to `create_action_task` RPC.
- `src/pages/provider/Settings.tsx` — auto-approve toggle.

### RPCs called from client
```
supabase.rpc('create_action_task', { _task_type, _tenant_id, _target_user_id, _target_role, _subject_entity_type, _subject_entity_id, _payload, _due_at })
supabase.rpc('act_on_task',        { _task_id, _action, _comment })
supabase.rpc('add_task_comment',   { _task_id, _body })
supabase.rpc('mark_notifications_read', { _ids })
supabase.rpc('mark_all_read')
```

### Story points (P1)
- Migration + RPCs + lifecycle triggers + cron: 8
- Notifications hook + bell/popover + realtime: 3
- TasksPage + detail panels + action dialogs: 5
- ClientConnect rewrite + auto-approve setting: 2
- Leak/trigger tests: 3

**Total P1: ~21 SP.**

## Out of scope this iteration
- Notifications for scheduled service visits (per user instruction).
- Existing `public.tasks` table — left untouched.
- Webhooks, attachments, email channel, encryption, per-user preferences (Priority 2).
