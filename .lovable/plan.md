# Email Operations: make it actionable + a Resend status light

Today the page only tells you something is wrong. This adds a one-glance status light and a fix button next to every problem.

## 1. Resend status light (green / yellow / red)

A single status pill at the top of `/admin/emails`, visible on every tab:

- **Green — Resend OK**: connector responds, no critical alerts, queues draining.
- **Yellow — Degraded**: warnings only (rate-limit cooldown, dead letters waiting, elevated failure rate, queue slow).
- **Red — Broken**: Resend connector unreachable or rejecting credentials, credential/domain failures, high failure rate, or work stuck with no dispatcher.

The pill is clickable and expands into the existing alert list, and shows "last checked" time. It refreshes every 15s.

Backing check: a new lightweight action pings the Resend connector's credential-verification endpoint (no email is sent) and returns reachable / auth-failed / unreachable. That result is combined with the existing alert severities to pick the colour.

## 2. Every alert gets an action button

Each alert card in the banner gets the relevant one-click action instead of just text:

| Alert | Action(s) |
| --- | --- |
| Messages in dead-letter queue | "Retry all" · "Discard all" · "Review" (jumps to the DLQ tab) |
| Resend credential / domain failure | "Re-check Resend" · link to reconnect the connector |
| Rate limit active | "Resume now" (clears the cooldown once the window has passed) |
| Queue not draining | "Run dispatcher now" |
| Dispatcher not scheduled while mail is waiting | "Restart dispatcher" |
| High / elevated failure rate | "View failures" (Activity tab, filtered to failed) |

Destructive ones (discard all, resume now) ask for confirmation first.

## 3. Dead-letter queue: bulk actions and a visible reason

The DLQ tab keeps the per-row retry/discard buttons and adds:

- Row checkboxes with **Retry selected** / **Discard selected**, plus **Retry all** / **Discard all** for the queue.
- A **Reason** column showing the last error that killed the message, with an expandable row for the full payload — right now you can't see why it failed.
- Age shown as "3 months ago" rather than a raw timestamp, and a live count in the tab label so the badge is visible without opening it.
- Every action stays logged to the admin audit log.

Note: the 5 stuck messages currently in the transactional dead-letter queue are from May 2026 test sends. Once these controls exist you can retry or clear them in one click.

## 4. Fix the false "dispatcher is missing" alarm

The sender runs on demand: it schedules itself when an email is queued and unschedules when the queues are empty. The current alert fires on the normal idle state. It will only fire when messages are actually waiting and no dispatcher is scheduled (or the wake trigger/dispatcher functions have gone missing) — the genuinely broken states.

## Technical notes

- Migration replacing `admin_email_alerts()`: gate the cron alert on queue depth from `pgmq.metrics_all()` plus existence of `email_queue_wake` / `email_queue_dispatch`; add an `actions` array (action code + label) to each alert object so the UI renders buttons generically.
- New actions in the `admin-email-ops` edge function (super-admin guarded, same as existing): `verify_resend` (gateway `verify_credentials`), `replay_dlq_bulk`, `discard_dlq_bulk`, `run_dispatcher` (calls `email_queue_dispatch()`), `clear_rate_limit`.
- `admin_list_dlq` extended to surface the last error message per message.
- New `EmailStatusPill.tsx`; updates to `EmailAlertsBanner.tsx`, `EmailDLQTab.tsx`, and `EmailOperations.tsx`.
