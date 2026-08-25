# Fix the open monitoring findings

Four findings are pending, not two — two from QA review and two from production error logs. All four are "high". The plan covers all of them; each is small and independent, so any can be dropped.

## 1. Password reset silently does nothing on a fast click (confirmed)

The forgot-password step arrives with the email already filled in from the previous step, so a user can click "Send reset email" in under two seconds. The bot guard treats anything faster than 2s as scripted and returns the enumeration-safe "check your email" response without issuing a token or sending mail. The user waits for a link that never comes.

Fix: keep the anti-bot timing check, but stop it from silently swallowing a legitimate request.

- The client sends the guard timestamp as today, but the reset form disables the submit button until the minimum fill time has elapsed (a short "one moment…" state on the button), so a real user physically cannot trip the timer.
- Server side, a `too_fast` rejection on password reset no longer returns a fake success. It returns a 429-style "please try again in a moment" with a retry hint. This is not an enumeration leak: the response depends only on timing, never on whether the email exists.
- Lower `MIN_FILL_MS` for the reset form specifically (reset has one prefilled field; 2s is calibrated for a multi-field signup). The signup wizard keeps the existing threshold.

## 2. Email Operations "Health" tab breaks whenever the queue is non-empty (confirmed)

`admin_email_health()` computes `now() - oldest_msg_age_sec`, but `pgmq.metrics_all()` already returns those columns as integer seconds (verified against the live queue metadata). Whenever a queue holds at least one message the columns are non-null and Postgres aborts with `operator does not exist: timestamp with time zone - integer`. The Health tab then renders only the red error card, and Activity's "In queue (now)" silently reads 0.

The identical bug was already fixed in `admin_email_alerts`; the same fix was never applied here.

Fix: one migration replacing `admin_email_health()` so the age columns are used directly (`oldest_msg_age_sec::int`, `newest_msg_age_sec::int`) with no timestamp arithmetic. Same signature, same super-admin guard, same `SECURITY DEFINER` and `search_path`. Also add a small error state to the Activity "In queue" card so a future RPC failure shows as unavailable rather than as a confident zero.

## 3. AI Assistant returns 500 for every request (confirmed)

`supabase/functions/ai-assistant/index.ts` calls `authClient.auth.getClaims(token)`. The function pins `@supabase/supabase-js@2.49.1`, which has no `getClaims` on the auth client, so every invocation throws before user resolution.

Fix: replace the call with `authClient.auth.getUser(token)` and read `data.user.id`, keeping the identical 401 behaviour on failure. No change to the downstream role/tenant resolution, burst limits, or tool handling.

## 4. Onboarding lifecycle emails (day 0/2/7) failing (needs confirmation first)

The reported cause is `lifecycle_drip_candidates` referencing a non-existent `public.visits`. The migration file does contain that reference, but the function currently live in the database already reads `public.service_orders` — so the deployed definition looks correct and the logged failures may predate a later repair.

Because of that, step one here is verification, not a fix:

1. Invoke `lifecycle-email-drip` directly and read the response plus function logs.
2. If it succeeds, the finding is stale and gets resolved as such — with the migration file's dead `public.visits` reference corrected so a future replay of migrations cannot reintroduce the break.
3. If it still fails, fix whatever the live error names (most likely the service-role grant on the RPC, or the caller's auth), then re-run.

No lifecycle emails are backfilled — day-0/2/7 windows are time-boxed, and sending a burst of stale welcome mail to old signups would be worse than the gap.

## Verification

- Reset: request a link with an immediate click and confirm the mail arrives (or the honest retry message appears); confirm a filled honeypot is still rejected.
- Health: load `/admin/emails` with a message sitting in the queue and confirm both the Health tab and "In queue (now)" render real numbers.
- AI: send one chat message as a provider and confirm a 200 with a reply.
- Lifecycle: direct invocation returns a candidate list without a Postgres error.

## Technical notes

- Files: `supabase/functions/_shared/form-guard.ts`, `supabase/functions/request-password-reset/index.ts`, `src/components/auth/AuthForgotStep.tsx`, `src/components/auth/HoneypotField.tsx`, `supabase/functions/ai-assistant/index.ts`, `src/components/admin/email-ops/EmailActivityTab.tsx`, plus one migration for `admin_email_health()` and, if needed, `lifecycle_drip_candidates`.
- No schema changes, no new tables, no RLS or grant changes beyond what item 4's verification may reveal.
