# Fix blank Email Operations page (/admin/emails)

## What the page is supposed to do

Email Operations is the super-admin control room for outgoing email:

- **Alerts banner** — warns about spikes in failures, a growing dead-letter queue, or a stalled queue processor.
- **Activity tab** — counters (Total / Sent / Failed / DLQ / Suppressed) plus a filterable, paginated log of every email (by time range, status, template, recipient), with per-email payload preview and a Resend action.
- **Dead-letter Queue tab** — emails that exhausted retries, with Replay and Discard actions.
- **Health tab** — queue depth, processor status, and sending configuration health.

## Why it looks blank

The page renders, but every panel is empty: counters read 0, the activity table stays on "Loading…", and the banner stays on "Checking email alerts…".

Two separate causes were confirmed:

1. **Permission** — the five backend functions the page calls (`admin_email_activity_stats`, `admin_list_email_activity`, `admin_email_alerts`, `admin_email_health`, `admin_list_dlq`, plus the DLQ replay/discard ones) have execute rights only for internal/service roles. Signed-in admins are not granted execute, so every call fails and the queries never resolve — which is why the table hangs on "Loading…" instead of showing an error.
2. **No recent data** — the email log holds 25 rows, all older than 14 June 2026, so nothing falls inside the default "Last 7 days" window even after permissions are fixed.

## Fix

1. Migration granting `EXECUTE` on the admin email functions to `authenticated`. Each function is already SECURITY DEFINER and must begin with a super-admin check (`is_super_admin(auth.uid())`, raising on failure) so granting execute cannot expose email data to normal users — add the guard to any function that lacks it in the same migration.
2. Surface failures instead of hanging: show an inline error state with the message in the Activity table, DLQ table, and alerts banner when a query rejects, plus a proper "No emails in this period" empty state.
3. Default the Activity time range to a window that shows existing data ("Last 30 days"), and add an "All time" option so historical entries are reachable.

## Technical notes

- Files: new migration under `supabase/migrations/`, `src/components/admin/email-ops/EmailActivityTab.tsx`, `EmailDLQTab.tsx`, `EmailAlertsBanner.tsx`, `EmailHealthTab.tsx`.
- No change to the sending pipeline, templates, or the `admin-email-ops` function itself.
- Verification: reload `/admin/emails` as super admin and confirm counters populate, the log lists rows, and the DLQ/Health tabs return data rather than spinners.
