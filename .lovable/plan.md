# Revised abuse-hardening plan (edge-first, phased)

The critique is accepted on points 1, 2, 3 and 5. Point 4 is already solved in this codebase — details below.
Phase 1 needs nothing from you. Upstash and Turnstile move to Phase 2.

## Correction on point 4 (email polling)

The event-driven model asked for is already in place:

- `email_queue_wake()` is an enqueue-time trigger. It fires `net.http_post` to `process-email-queue` immediately inside the enqueue transaction (errors swallowed so a mail failure can never roll back the business action).
- It also arms a self-scheduling 5-second dispatch job that `email_queue_dispatch()` **unschedules itself** once both queues are empty (advisory-lock serialized against the arm path). This drains a backlog and resumes after a Resend `retry_after_until` backoff — a plain insert trigger can do neither.
- `email-queue-heartbeat` (the 1-minute job) runs entirely inside Postgres and returns on an empty-queue check. It does **not** cost ~43k edge invocations/month — it costs near zero. It only recovers a missed wake (pg_net drop, crash mid-batch, requeued message after visibility timeout).

Action in Phase 1: keep the architecture, drop the heartbeat to every 5 minutes.

---

# Phase 1 — no external services, ship now

## 1.1 In-isolate burst limiter

`supabase/functions/_shared/ratelimit.ts`: a `Map`-based sliding-window counter held in the Deno isolate's memory. Zero Postgres, zero network, zero new tables.

- Honest limitation: state is per warm isolate, so it does not coordinate across concurrent isolates. It reliably kills the common case — one script looping a single endpoint — and it is the correct place to put the check regardless, because Phase 2 swaps the backing store behind the same interface.
- Buckets: `signup:ip`, `pwreset:ip`, `pwreset:email`, `ai:user`, `ai:tenant`. IPs are hashed before use as keys; nothing is persisted.
- Entries are evicted on read when their window has expired, so the map cannot grow unbounded within an isolate's life.

## 1.2 No `public.rate_limits` table

Dropped entirely. Nothing new is written to Postgres on the hot path, so there is no bloat and no GC cron to maintain.

## 1.3 Zero-dependency bot friction on the two public forms

In place of User-Agent sniffing and subnet bans (both removed from the plan — CGNAT risk):

- **Honeypot field** on the signup wizard and the password-reset form: a visually hidden input that real users never fill. Filled → 400 before any DB work.
- **Minimum form-fill time**: a signed timestamp issued when the form mounts; submissions faster than ~2s are rejected. Both checks are verified server-side in `create-manual-user` and `request-password-reset`.
- These stop naive scripted signups. They do not stop a determined attacker — that is what Turnstile in Phase 2 is for.

## 1.4 AI endpoint: cheap checks first

Order in `ai-assistant`, cheapest first:
1. JWT verify (already present).
2. In-isolate burst limit per user and per tenant → 429 with `Retry-After`.
3. Postgres tenant AI quota (entitlement-driven) → clear "limit reached" response.
4. Model call.

This keeps the Postgres quota read off the path a looping script hits most often.

## 1.5 Existing-signal abuse visibility

Small "Abuse & serverless" panel in the admin dashboard built from data we already collect — `analytics_events`, `super_admin_audit_logs`, `email_send_log`, plus rejection counters logged by the guards. No new tables.

## 1.6 Heartbeat reschedule

`email-queue-heartbeat` from every minute to every 5 minutes.

---

# Phase 2 — when you have the accounts (deferred)

Same interfaces, better backing stores. Nothing in Phase 1 is thrown away.

- **Upstash Redis** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`): replace the in-isolate map inside `ratelimit.ts` with an `INCR`+`EXPIRE` pipeline over the REST API. Gives cross-isolate, globally consistent limits with native TTL, fail-open on Upstash errors. One file changes; no call sites change.
- **Cloudflare Turnstile** (`VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`): invisible widget on the signup and reset forms, token verified server-side via `siteverify` before either function touches the database. Replaces the honeypot as the primary gate (honeypot stays as a free second layer).

## Technical notes

- Phase 1 files: `supabase/functions/_shared/ratelimit.ts` (new), `create-manual-user`, `request-password-reset`, `ai-assistant`, the signup wizard and reset form on the frontend, one admin panel component, one cron reschedule.
- No new tables, no new RLS policies; the only migration is the heartbeat reschedule.
- Lovable ships no managed rate-limiting primitive; this is a deliberate ad-hoc implementation, with the per-isolate limitation of Phase 1 stated above rather than hidden.
