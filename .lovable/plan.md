# Email Operations: fix the blank page + rescope to the Resend handoff model

## Validation of the proposed rescoping

The rescoping is correct and matches how this project actually sends email (own pgmq queue + worker + Resend via the connector gateway). Three points need adjusting before it can be built as written:

1. **The Resend ID is not stored today.** The worker calls Resend, checks only for HTTP errors, and discards the response body — every `sent` row in the email log has empty metadata. So the deep link cannot be built from existing data; the worker must be changed to capture the returned ID and record it. Historic rows (9 sent) will never have a link and must render as "—".
2. **Bounce/complaint handling already exists and should stay.** There is a suppression webhook and a suppression list that blocks future sends to bad addresses, and the log's status vocabulary already includes bounced/complained. "Do not add columns or UI for delivery status" is right as a *forward-looking* rule, but must not be read as "remove what's there" — suppression is a sending-safety mechanism, not delivery analytics.
3. **The Health tab already does most of what is asked.** It reports queue depth, oldest/newest message age, and whether the queue-processor job is scheduled. Missing are only the explicit worker heartbeat and DLQ growth today vs yesterday.

Everything else — Activity as an internal handoff log, DLQ as "never made it to Resend", replay pushing back into the queue, tenant-to-Resend-ID mapping — is already the shape of the system and needs no structural change.

## Why the page is blank

Two confirmed causes:

1. **Permission.** The functions the page calls are executable only by internal/service roles, so every call from a signed-in admin fails and the panels never resolve — the table hangs on "Loading…" instead of showing the error.
2. **No recent data.** The log holds 25 rows, all older than 14 June 2026, so nothing falls in the default "Last 7 days" window even once permissions are fixed.

## Work

**A. Unblock the page**
- Migration granting execute on the admin email functions to signed-in users. Each is already privileged-mode and starts with a super-admin check that raises for anyone else, so no email data becomes reachable by normal users; add the guard to any function missing it in the same migration.
- Show the actual error inline in the Activity table, DLQ table and alerts banner instead of an endless spinner, plus a real "no emails in this period" empty state.
- Default the Activity range to Last 30 days and add an "All time" option.

**B. Capture and surface the Resend ID**
- Worker: read the ID from the Resend response and store it on the send-log row alongside the existing tenant reference.
- Activity table: new "Resend" column rendering the stored ID as an external link to the Resend dashboard for that email; "—" when absent.
- Activity states relabelled to the internal journey: Queued → Processing → Handed to Resend → Failed (internal).

**C. Health tab additions**
- Worker heartbeat derived from the age of the oldest locked/in-flight message, shown as OK / stalled.
- DLQ growth today vs yesterday.

**D. Guardrail**
- Nothing that tracks opens, clicks, or delivery outcomes gets added to the schema or the UI. Existing bounce/complaint suppression stays as-is because it protects sending, not because it reports delivery.

## Technical notes

- Migration under `supabase/migrations/`; worker change in `supabase/functions/process-email-queue/index.ts` (redeploy required); UI in `src/components/admin/email-ops/*`; health/alert function bodies updated in the same migration.
- No change to templates, the sending path itself, or the sender domain.
- Verification: reload `/admin/emails` as super admin — counters populate, the log lists rows, Health and DLQ return data; then trigger one test send and confirm a Resend link appears on the new row.
