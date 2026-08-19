# Revised abuse-hardening plan (edge-first)

The critique is accepted on points 1, 2, 3 and 5. Point 4 is already solved in this codebase — details below.

## What changes vs the previous plan

| Item | Previous | Revised |
|---|---|---|
| Rate limiting store | `public.rate_limits` in Postgres | Upstash Redis over REST, called from the edge |
| Table pruning | not addressed | no table to prune |
| Bot detection | User-Agent / subnet heuristics | Cloudflare Turnstile verified server-side |
| Email heartbeat | reduce cron to 5 min | already event-driven; heartbeat demoted to a 5-min safety net |
| AI protection | tenant daily quota | per-JWT burst limit at the edge *before* the quota query |

## Correction on point 4 (email polling)

The event-driven model asked for is already in place:

- `email_queue_wake()` is an enqueue-time trigger. It fires `net.http_post` to `process-email-queue` immediately inside the enqueue transaction (errors swallowed so a mail failure can never roll back the business action).
- It also arms a self-scheduling 5-second `process-email-queue` dispatch job, which `email_queue_dispatch()` **unschedules itself** as soon as both queues are empty (advisory-lock serialized against the arm path). This exists to drain a backlog and to resume after a Resend `retry_after_until` backoff — a plain insert trigger cannot do either.
- `email-queue-heartbeat` (the 1-minute job) runs entirely inside Postgres and exits on an empty-queue check. It does **not** produce ~43k edge invocations/month — it produces near zero. Its only job is to recover a missed wake (pg_net drop, crash mid-batch, requeued message after visibility timeout).

Action: keep the architecture, drop the heartbeat to every 5 minutes. Removing it entirely would leave stuck messages invisible until the next organic enqueue.

## 1. Edge rate limiting on Upstash Redis

- New shared module `supabase/functions/_shared/ratelimit.ts` — a fixed-window / sliding-window counter over the Upstash REST API (`INCR` + `EXPIRE` pipeline, one round trip). No SDK, no connection pool, no Postgres involvement.
- Fail-open on Upstash 5xx/timeouts (never block legitimate mail or signups because Redis blinked), fail-closed only on an explicit rate-limit hit.
- Buckets:
  - `signup:ip:<hashed ip>` — 5 / hour, 20 / day
  - `pwreset:ip:<hashed ip>` — 5 / hour; `pwreset:email:<sha256>` — 3 / hour
  - `ai:user:<uid>` — 10 / minute burst
  - `ai:tenant:<tid>` — 60 / minute burst
- IPs are hashed before use as keys; no raw IP is persisted anywhere.
- Requires two secrets: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. I will request these via the secret prompt when the work starts.

## 2. No `public.rate_limits` table

Dropped from scope entirely, so the GC concern is moot. Nothing new is written to Postgres on the hot path.

## 3. Cloudflare Turnstile on the two public forms

- Frontend: invisible Turnstile widget on the signup wizard (`/onboard`) and the password-reset form; token sent in the request body.
- Backend: `supabase/functions/_shared/turnstile.ts` verifies the token against `https://challenges.cloudflare.com/turnstile/v0/siteverify` before `create-manual-user` / `request-password-reset` touch the database. Missing or invalid token → 400, no DB work.
- No User-Agent sniffing, no subnet bans — removed from the plan (CGNAT risk).
- Requires `VITE_TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (server).

## 4. AI endpoint: burst limit before quota

Order of checks in `ai-assistant`, cheapest first:
1. JWT verify (already present).
2. Upstash burst limit per user and per tenant → 429 with `Retry-After`.
3. Postgres tenant daily/monthly AI quota (entitlement-driven) → 402-style "limit reached".
4. Model call.

This keeps the expensive Postgres quota read off the path a looping script hits.

## 5. Visibility

Small "Serverless & abuse" panel in the admin dashboard: 24h counts of rate-limit rejections and Turnstile failures per bucket (read from Upstash counters, not a new table), plus the current AI quota consumption per tenant.

## Technical notes

- Files touched: `supabase/functions/_shared/{ratelimit,turnstile}.ts` (new), `create-manual-user`, `request-password-reset`, `ai-assistant`, the signup wizard and reset form on the frontend, one cron reschedule for `email-queue-heartbeat`, one admin panel component.
- No new tables, no new RLS policies, no migration except the heartbeat reschedule.
- Lovable does not ship a managed rate-limiting primitive; this is a deliberate ad-hoc implementation with the fail-open tradeoff stated above.

## Prerequisites from you

- An Upstash Redis database (free tier is sufficient) → REST URL + token.
- A Cloudflare Turnstile site → site key + secret key.
