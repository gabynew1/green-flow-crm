# Email Operations MVP — align backend, keep the working UI

Most of this brief is already built. Verified against the live database and code, here is what actually differs.

## Already in place (no work needed)

- All seven admin functions exist, are `SECURITY DEFINER`, set `search_path`, and start with an `is_super_admin(auth.uid())` guard. The DLQ functions are named `admin_replay_dlq` / `admin_discard_dlq` — same behaviour as the proposed `admin_dlq_replay` / `admin_dlq_discard`. Recommendation: keep the existing names rather than create duplicates.
- Activity tab already defaults to Last 30 days, fetches everything through React Query, shows destructive inline error states instead of hanging, and renders `resend_id` as a deep link to `https://resend.com/emails/{id}`.
- DLQ tab already has an Actions column with per-row Replay/Discard, per-button spinners, confirmation on discard, toasts, and a refresh of the alert/health queries on success.
- No bounce/complaint webhook ingestion exists; Resend remains the source of delivery truth.

## What to change

### 1. Restore the worker schedule (root cause of "nothing sends")
`cron.job` currently has no `process-email-queue` entry. Schedule it every minute, calling the function over HTTP with the service-role key read from Vault (same pattern as the existing lifecycle cron jobs).

### 2. Retention 365 → 30 days
`purge_old_email_logs()` deletes rows older than 365 days and is missing `search_path` hardening. Change the cutoff to 30 days, keep the audit row it writes, and pin `search_path = public`. The daily 03:00 job itself stays as is.

### 3. Stop dual-writing `pending` rows
`send-transactional-email` inserts a `pending` row before enqueueing. Remove that insert so the log only records terminal outcomes (`sent` with `resend_id`, `failed`, `dlq`, `suppressed`). Keep the pre-flight `suppressed` / blocked-by-preference inserts — those are terminal decisions, not queue state.

Consequences to handle in the same change:
- The worker's duplicate-send guard and retry counter both read `email_send_log`; retry counting moves to pgmq's `read_ct` (already available) so removal of `pending` rows does not break retry limits.
- `admin_resend_email` reads `template_data` from the `pending` row to rebuild a resend payload. With `pending` gone it must read the `sent`/`failed` row instead — those rows need to carry `template_data` too.
- The Activity tab's "Queued" stat can no longer come from the log; it will read live queue depth from `admin_email_health` and be shown as a separate "In queue" card.

### 4. Activity tab: surface live queue depth
Add an "In queue (now)" card next to the existing counters, fed by the queue metrics already returned by `admin_email_health`.

## Technical notes

- Cron creation runs through a data statement (contains the project URL and key reference), not a schema migration.
- Functions touched: `purge_old_email_logs`, `admin_resend_email`, plus the `process-email-queue` and `send-transactional-email` edge functions (both redeployed).
- No new tables, no Lovable native email tooling, no local suppression list.

## Out of scope

Renaming the DLQ RPCs, webhook ingestion, delivery/open/bounce analytics.
