## Goal

Ship the auth-email + onboarding system in **6 incremental phases**. Phase 1 produces a working, end-to-end-usable system (unhardened). Phases 2–6 progressively add enterprise hardening. Every phase ends with an explicit cleanup pass so dead code, dead routes, and dead DB objects don't accumulate.

Each phase is independently deployable, independently revertible, and leaves the app in a working state.

---

## Phase 1 — Minimum viable foundation (working, unhardened)

**Goal**: working email verification path + working onboarding drip, using Supabase native primitives. No new tables we can avoid. No gating. No locale. No Turnstile yet.

**Build**
- **Verification (delegate to Supabase, do NOT build a parallel system)**
  - `profiles.email_verified boolean` + `profiles.email_verified_at timestamptz`, mirrored from `auth.users.email_confirmed_at` via a trigger on `auth.users`. Backfill existing users.
  - New page `/verify` that accepts both flows: link (`?token=…&type=email`) calls `supabase.auth.verifyOtp`, and a 6-digit code form calls `verifyOtp({ type: 'email', email, token: code })`. Both already supported natively — no custom token table.
  - Reuse the existing `signup.tsx` template; extend it to render BOTH the magic link AND the 6-digit `{{ .Token }}` Supabase already provides.
  - `<VerifyEmailBanner />` in `ProviderLayout` for `email_verified=false`. Non-blocking (banner only — gating comes in Phase 4).
  - "Resend verification" button calls `supabase.auth.resend({ type: 'signup', email })`. Supabase has built-in rate limits for this — good enough for Phase 1.
- **Lifecycle drip — minimal**
  - New table `lifecycle_email_log(user_id, tenant_id, step, sent_at, skipped_reason, created_at, UNIQUE(user_id, step))` + enum `lifecycle_step('day_0','day_2','day_7')`.
  - Add `cat_onboarding_enabled boolean default true` to `tenant_email_settings`. Insert `lifecycle` row in `email_categories`.
  - Three React Email templates registered with category `'lifecycle'`. English only.
  - New edge function `lifecycle-email-drip`, scheduled `*/15 * * * *`. Uses `FOR UPDATE SKIP LOCKED` on the candidate query. Hard cap: abort + alert if candidate set > 200 in one tick.
  - Idempotency key `lifecycle-<step>-<user_id>`. Skip reasons: `category_disabled`, `suppressed`, `unsubscribed`, `already_active`, `email_not_verified`, `tenant_paused`, `safety_cap_hit`.
  - Anchor windows on `coalesce(email_verified_at, created_at)` so unverified users aren't permanently skipped.
- **UI surface**
  - Provider Settings → Email Notifications: toggle row "Product tips & onboarding".
  - SuperAdmin Email Activity already shows new templates automatically.

**Cleanup in Phase 1**
- Delete `.lovable/plan.md` references to the previously-proposed `email_verification_tokens`, `request-email-verification`, and `verify-email` functions — they will never be built.
- Remove any leftover scaffolding from earlier exploratory commits (none expected, but grep before closing).

**Done when**: a new signup gets the verification email, can verify via link or code, and gets Day-0 within 15 min.

---

## Phase 2 — Deliverability foundation (do this BEFORE volume grows)

**Goal**: protect transactional deliverability from lifecycle/marketing fallout. This is the highest-leverage step and must come early — fixing it later means warming a new domain.

**Build**
- Provision a second sender subdomain dedicated to lifecycle: `go.greengrasscrm.ro` (transactional stays on `notify.greengrasscrm.ro`).
- Route lifecycle templates through the new subdomain via a `sender_subdomain` field on `email_categories`. `send-transactional-email` resolves the From address per category.
- Add **RFC 8058 List-Unsubscribe-Post** header to all bulk-eligible emails (lifecycle + future marketing). Required by Gmail/Yahoo bulk-sender rules. The existing one-click unsubscribe endpoint already accepts the POST — just add the header.
- Add `email_send_log.bounce_type` and `email_send_log.complaint_at` columns. Wire Resend webhooks (`email.bounced`, `email.complained`) into the existing `handle-email-suppression` to populate them.
- Auto-pause switch: if lifecycle complaint rate > 0.3% over rolling 24h, set `cat_onboarding_enabled=false` platform-wide and alert SuperAdmin.

**Cleanup in Phase 2**
- Audit and remove any hardcoded `from:` addresses in templates — must all flow through the category resolver.

**Done when**: lifecycle emails ship from `go.`, Gmail bulk-sender headers pass, auto-pause is armed.

---

## Phase 3 — Rate limiting + bot protection

**Goal**: protect the auth-email endpoints from abuse and email-bombing.

**Build**
- New table `auth_rate_limit(key text, window_start timestamptz, count int, PRIMARY KEY(key, window_start))` with a 7-day TTL cleanup job.
- SQL helper `auth_rate_check(_key, _limit, _window_seconds)` — sliding window, atomic upsert.
- Wrap two endpoints behind it:
  - `request-password-reset` (new thin edge function — replaces direct client call to `resetPasswordForEmail`). Limits: 5/hr per email, 5/hr per IP, 20/day per IP.
  - `resend-verification` wrapper — same limits, calls `supabase.auth.resend` underneath.
- Add Cloudflare Turnstile to `/auth/forgot` and the resend-verification button. Token verified server-side in the wrappers.
- Redact `code` and `token` keys from `template_data` before insertion into `email_send_log` (defense in depth — Supabase OTP codes shouldn't land in JSONB archives).

**Cleanup in Phase 3**
- Remove direct calls to `supabase.auth.resetPasswordForEmail` from `src/pages/Auth.tsx` and any other call sites. All resets must route through the wrapper.
- Remove Phase 1's reliance on Supabase's built-in rate limit notes from the verification banner copy (no longer the only line of defense).

**Done when**: brute-force/email-bomb attempts return 429 with Retry-After; password reset only works via the wrapper.

---

## Phase 4 — Security notifications + session hygiene

**Goal**: account-takeover resistance. Sensitive auth events must produce notifications and revoke active sessions.

**Build**
- New edge function `security-notifications` (separated from `auth-email-hook` — different concern).
- Three new templates (category `account`, required, non-unsubscribable):
  - `auth-email-change-alert` — sent to OLD address when an email change is requested. Includes a 24-hour "this wasn't me — undo" link signed with HMAC.
  - `auth-password-changed` — sent after successful password update.
  - `auth-new-device-login` — sent on login from a new IP/UA fingerprint (best-effort; we do not have full device telemetry yet — log a `LOW_CONFIDENCE` flag).
- Session revocation: on password change AND on email change confirmation, call `supabase.auth.admin.signOut(user_id, 'global')` to invalidate all refresh tokens.
- Email-change undo path: 24-hour window where the old address can revert. Stored in a small `email_change_pending(user_id, old_email, new_email, undo_token_hash, expires_at)` table.
- Add `security_audit_log(user_id, event, ip, user_agent, metadata, created_at)` table. Log: verification, password change, email change request/confirm/undo, new-device login.

**Cleanup in Phase 4**
- Remove the temporary "we'll wire this in Phase 4" TODOs left in `auth-email-hook` from Phase 1.
- If `auth-email-hook` was extended in Phase 1 with non-auth concerns, move them out now.

**Done when**: all three security events fire, sessions are revoked, undo path works end-to-end.

---

## Phase 5 — Gating, feature flags, and i18n

**Goal**: enforce verification on sensitive writes, safely; add Romanian.

**Build**
- New `feature_flags(key, scope, scope_id, enabled, payload)` table — generic, scoped per-tenant or global.
- Flag `require_email_verification_for_writes` (default off). When on for a tenant, RLS WITH CHECK blocks inserts on `customers`, `properties`, `offers`, `provider_invites` for users with `email_verified=false`. SECURITY DEFINER RPC audit pass to confirm none silently bypass.
- Banner upgrades from "encouraging" to "required" copy when the flag is on.
- Staged rollout: SuperAdmin UI to flip the flag per tenant; default-on for new tenants only.
- **i18n**: `profiles.locale` (default `'en'`, `'ro'` supported). Each lifecycle + auth template gets a `ro` variant. Resolver picks template by locale. Subject lines and preheaders moved to a small `email_template_strings(template_name, locale, key, value)` table so future copy changes don't require a deploy.
- **Quiet hours + frequency cap** for lifecycle category: skip sends between 22:00–07:00 in `profiles.timezone` (default `Europe/Bucharest`). Max 1 lifecycle email per user per 48h across all current and future drips. New skip reasons: `quiet_hours`, `frequency_cap`.

**Cleanup in Phase 5**
- Drop any English-only string constants from template TSX files; everything reads from the strings table.
- Remove the Phase 1 hardcoded `Europe/Bucharest` assumption anywhere it sneaked in.

**Done when**: a tenant can be flipped to strict gating without breaking other tenants; lifecycle emails arrive in Romanian for `locale='ro'` users.

---

## Phase 6 — Measurement, observability, runbooks

**Goal**: know whether the drip works; detect failures before users do.

**Build**
- Resend webhook ingestion for `email.delivered`, `email.opened`, `email.clicked` → new `email_engagement_events` table. Per-template open/click rollups in the SuperAdmin dashboard.
- **Holdout group**: 5% of new tenants permanently flagged `lifecycle_holdout=true`, never receive drip. Used as control group.
- **Activation metric**: define and store `tenants.activated_at` = first of (first customer added | first offer sent | 3rd visit completed). Cohort table `onboarding_cohorts` joins signup week → activation rate, split by holdout.
- **SLOs** (recorded as a markdown file under `docs/` plus a SuperAdmin "Health" widget):
  - Verification email p95 latency < 30s, p99 < 60s.
  - Auth queue depth < 100 sustained.
  - DLQ rate < 0.5% over 24h.
- **Synthetic canary**: edge function `email-canary` runs every 30 min — signs up a throwaway `canary+<ts>@greengrasscrm.ro`, verifies via API, deletes. Alerts SuperAdmin on failure.
- **Runbooks** in `docs/runbooks/`:
  - `email-dlq-filling.md`
  - `resend-outage.md`
  - `lifecycle-complaint-spike.md`
  - `verification-canary-failed.md`
- **Account recovery codes**: generated at signup, downloadable once, hashed at rest. Recovery flow uses one code → resets password without email access. Out of scope: WebAuthn/MFA (acknowledge as Phase 7+).

**Cleanup in Phase 6**
- Delete any ad-hoc dashboards or queries replaced by the new engagement rollups.
- Drop unused columns from `email_send_log` if any were added speculatively in earlier phases.
- Final repo-wide grep for `TODO:` comments tagged with `auth-email-plan` and resolve or file as new tickets.

**Done when**: SuperAdmin can see open rates per template, holdout vs treated activation rates, and gets paged when the canary fails.

---

## Cross-cutting cleanup discipline (every phase)

At the end of each phase, the implementing AI must:
1. **Grep for orphans**: `rg "TODO\|FIXME\|XXX" supabase/functions/ src/` scoped to files touched this phase.
2. **Drop unused DB objects**: any column/table/function added in an earlier phase that this phase made redundant.
3. **Remove dead routes**: any page added in an earlier phase that is no longer linked.
4. **Update memory**: `mem://infrastructure/email-setup` reflects current architecture, not phase intent.
5. **Confirm the previous phase's templates and flows still work** — no silent breakage.

---

## Out of scope (acknowledged debt, not in this plan)

- WebAuthn / TOTP MFA enrollment.
- Full device fingerprinting for new-device alerts (best-effort only).
- DMARC report ingestion (`p=quarantine` policy is assumed already set on the sender domains).
- Marketing/newsletter system (lifecycle ≠ marketing; if needed, separate domain `mail.`).
- EmailProvider abstraction layer for multi-provider failover.
- Full domain-event bus.

These are tracked as P2 items and deliberately deferred so Phase 1–6 stay shippable.

---

## What I'm NOT doing from the original plan (deletions)

- The custom `email_verification_tokens` table — replaced by Supabase's native `verifyOtp` flow.
- The custom `request-email-verification` and `verify-email` edge functions — replaced by `supabase.auth.resend` + `supabase.auth.verifyOtp` plus the Phase 3 wrapper for rate limiting only.
- Counting `email_send_log` rows for rate limiting — replaced by dedicated `auth_rate_limit` table in Phase 3.
- Extending `auth-email-hook` with security notifications — split into `security-notifications` in Phase 4.

---

## Phase sizing (rough)

- Phase 1: ~1 implementation session, fully working baseline.
- Phase 2: ~½ session + DNS wait for the new subdomain.
- Phase 3: ~1 session.
- Phase 4: ~1 session.
- Phase 5: ~1.5 sessions (i18n is the long pole).
- Phase 6: ~1 session + ongoing tuning.

After approval I'll start with Phase 1 only. We review at each phase boundary before continuing.
