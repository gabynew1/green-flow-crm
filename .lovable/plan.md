# Signup Lifecycle — Phased Plan

Foundation first, then layer security, growth, and UX. Each step ships independently and leaves the system better than before.

## Step 1 — Foundation: `signup_completed` event + super admin notify (THIS STEP)

Goal: every signup (provider tenant or client) fires one canonical event. Super admins get an email, a bell notification, and an activity-feed row. Everything later hangs off this event.

Scope:
- DB migration:
  - Extend `handle_new_user()` to call a new SECURITY DEFINER `fn_emit_signup_completed(profile_id)` inside a `BEGIN/EXCEPTION` block (never blocks signup).
  - `fn_emit_signup_completed`:
    - Resolves account type from profile (`role`, `tenant_id`) → label "New provider tenant" / "New client" / "New user".
    - Inserts one `activity_log` row, `source='system'`, `action='signup'`, with `metadata` = role, tenant id, email, full name.
    - Inserts one `user_notifications` row per super admin (type `new_signup`, deep link `/admin/users/{profile_id}`).
    - Enqueues one email per super admin via existing `enqueue_email` into `transactional_emails`, idempotency key `new-signup-<profile_id>-<recipient>`.
  - Idempotency guard: `activity_log` unique partial index on `(action, (metadata->>'profile_id'))` where `action='signup'`.
- Email template (new):
  - `supabase/functions/_shared/transactional-email-templates/super-admin-new-signup.tsx` — RO copy, branded layout reused from existing templates, subject `Cont nou pe GreenGrassCRM — {full_name}`, body: name, email, role, tenant (if provider), timestamp, CTA "Vezi contul".
  - Register in `_shared/transactional-email-templates/registry.ts`.
  - Deploy `send-transactional-email`.
- Frontend (minimal, reuse only):
  - Add `new_signup` case to the existing notification renderer (icon + label mapping).
  - Add `signup` case to the existing activity feed label map ("Cont nou: {name} ({role})").

No new tables, no new edge functions, no new UI screens.

## Step 2 — User-side welcome email ✅

- Welcome template (RO) per role: provider variant ("creează primul contract"), client variant ("conectează prima proprietate").
- Triggered from the same `fn_emit_signup_completed` so it stays one source of truth.
- Idempotent per `profile_id`.

## Step 3 — Consent, attribution & audit capture ✅

- Add `signup_metadata jsonb` to `profiles` (utm_source/medium/campaign, referrer, landing path, signup_method, signup_variant).
- Add `accepted_tos_at`, `accepted_privacy_at`, `tos_version`, `marketing_opt_in` columns + checkbox in signup form (RO).
- Capture truncated IP (`/24`) + country + user-agent in `activity_log.metadata` (GDPR-friendly).
- Surface in super admin user detail.

## Step 4 — Provider vs client routing

- Client signups also notify the linked tenant's `PROVIDER_ADMIN`s (bell + email, reusing same fan-out).
- Provider signups also auto-init: `subscription_status='trial'`, `trial_ends_at = now()+14d`, seed default service catalog/zones if missing, seed onboarding checklist.
- Email subjects diverge: "Trial provider nou" vs "Client nou pentru {tenant}".

## Step 5 — Anti-noise: digest, dedupe, quiet hours

- Per-super-admin preference in `user_email_preferences`: instant / hourly digest / daily digest.
- Use existing `notification_dedupe` to collapse bell rows ("12 signups noi în ultima oră").
- Threshold: instant up to 5/hour, then auto-switch to hourly digest for that admin.
- Background worker (extend `lifecycle-cron`) flushes digests.

## Step 6 — Risk scoring & soft hold

- Score on disposable-domain list, free-mail vs business, IP geo outside RO/EU, signup velocity per IP/ASN, headless fingerprint.
- High-risk → `profiles.review_status='pending_review'`, account read-only until approved.
- Super admin email gets inline buttons: "Aprobă", "Suspendă", "Marchează spam" (signed tokens, single-use, expiry 7d, reuses existing token pattern).
- Score + factors shown in admin user detail.

## Step 7 — Lifecycle drip scheduling

- On `signup_completed`, schedule trial drip (D-7, D-3, D-1, D-0 for providers) via existing `lifecycle_email_log_v2`.
- Register signup as the entry event in `lifecycle-email-drip`.
- Funnel events table: `signup_started`, `signup_completed`, `first_login`, `first_value_action` (first contract / first property linked).

## Step 8 — Super admin analytics tile

- Reuses existing card components on Super Admin dashboard:
  - Signups 24h / 7d / 30d (provider vs client split).
  - Activation rate (signup → first_value_action).
  - Risk-flagged %.
  - Source breakdown from `signup_metadata`.

## Step 9 — Async fan-out (refactor)

- Once Steps 1–8 work synchronously inside the trigger, move heavy side-effects (risk scoring, drip scheduling, analytics forward) behind `pg_notify('signup_completed', ...)` consumed by an edge function, keeping the auth path < 50ms.
- Errors land in a `signup_post_hook_errors` table with retry button in admin UI.

## Step 10 — External fan-out (optional)

- Slack/Telegram ping for paying-tier signups only (reuses Telegram connector context already in the project).
- PostHog/Plausible event forward from the async worker.

---

## Implementing Step 1 now

When you approve this plan, Step 1 will produce:

1. One migration creating `fn_emit_signup_completed` + idempotency index + `handle_new_user` extension.
2. One new email template file + registry update.
3. Tiny renderer updates for `new_signup` notification type and `signup` activity action.
4. One redeploy of `send-transactional-email`.

Subsequent steps will be proposed as their own plans when you're ready.
