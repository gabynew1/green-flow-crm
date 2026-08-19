# Serverless usage and abuse-risk review

## Where you stand today

Usage is effectively zero-cost right now:

- 24 edge functions deployed; near-zero invocations in the last 7 days (only a couple of log entries), 9 analytics events in 7 days.
- The only steady background load is cron: 8 scheduled jobs. The heaviest is `email-queue-heartbeat` at every minute (~43k invocations/month); everything else is every 15 min or daily. That is the floor of your bill and it is small and predictable.

So today's spend is driven by cron, not by traffic. The risk is not "current usage", it is that spend is elastic and several endpoints can be hit by anyone.

## The actual attack surface

10 functions run with `verify_jwt = false`, meaning Supabase does not reject unauthenticated calls at the edge — each must defend itself in code. Reviewed one by one:

Well defended (validate the caller before doing work):
- `send-transactional-email`, `preview-transactional-email`, `render-email-webview`, `invite-team-member`, `admin-email-ops`, `process-email-queue`, `handle-email-suppression` (signed webhook), `confirm-password-reset` (token-gated).
- `ai-assistant` requires a valid JWT and resolves roles server-side.

Exposed to volumetric abuse:
1. `create-manual-user` — public signup path. No rate limit of any kind. A script can create unlimited accounts: each one costs an edge invocation, DB writes, tenant seeding, and a queued Resend email.
2. `request-password-reset` — limits to N tokens per hour *per existing user*, but there is no per-IP limit and no cap on requests for non-existent emails. An attacker can hammer it endlessly; each call does an admin user lookup. Cheap per call, unbounded in volume.
3. `handle-email-unsubscribe` — unauthenticated, service-role, no throttle.
4. `ai-assistant` — authenticated, but there is no per-user or per-tenant message quota. One signed-in trial account can burn AI credits in a loop. This is the highest financial-blast-radius item because AI calls cost far more per request than an edge invocation.

There is no shared rate-limit table in the database — each function invents its own (or none).

## Proposed hardening

Small, boring, and enough to cap worst-case spend.

1. Shared limiter: one `public.rate_limits` table (key, window_start, count) plus a `fn_check_rate_limit(key, limit, window)` SECURITY DEFINER function that increments and returns allow/deny. Service-role only, no client grants.
2. Apply it to:
   - `create-manual-user`: per-IP-subnet, e.g. 5 signups/hour, 20/day; return 429.
   - `request-password-reset`: per-IP 10/hour on top of the existing per-user rule; keep the generic response so nothing is enumerable.
   - `handle-email-unsubscribe`: per-IP 30/hour.
   - `ai-assistant`: per-user 30 messages/hour and per-tenant daily cap tied to tier, returning a clear "limit reached" message rather than an error.
3. Add a bot check on public signup: the signup wizard already collects metadata; reject obvious automation (missing UA, same subnet burst) at the same guard.
4. Cost ceiling visibility: a small "Serverless usage" panel in the admin dashboard reading invocation counts and AI-request counts per day, so a spike is visible before it becomes a bill.
5. Optional and cheap: reduce `email-queue-heartbeat` from every minute to every 5 minutes unless the current latency matters.

## Technical notes

- All limits are enforced inside the function bodies since `verify_jwt = false` cannot be turned on for public endpoints without breaking signup and unsubscribe links.
- Limiter writes use service-role, so RLS is bypassed by design; the table gets no `anon`/`authenticated` grants.
- Denials return HTTP 429 with a plain message; the UI surfaces it as a toast.
