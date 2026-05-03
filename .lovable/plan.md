# Audit & fix every email-sending path → all routed through Resend

## What I found

I traced **every** code path that sends email. Here's the complete inventory:

### Path 1 — Supabase Auth emails (BROKEN — root cause of your missing OTP)
- **Triggers:** `auth.signUp`, `auth.signInWithOtp`, `auth.resetPasswordForEmail`, `auth.resend` — used in `useAuth.tsx`, `Verify.tsx`, `AuthForgotStep.tsx`, `VerifyEmailBanner.tsx`.
- **Expected flow:** Supabase Auth → Send Email Hook → `auth-email-hook` (HMAC-verified) → enqueues into `auth_emails` queue → `process-email-queue` → Resend.
- **Actual:** `POST /resend` returns 200 but `auth-email-hook` is **never invoked** (0 logs ever, queue total = 0). Supabase Auth has no Send Email Hook URL registered, so it falls back to its internal default sender — which on this project effectively does nothing.

### Path 2 — App emails (WORKING)
- **Helper:** `src/lib/send-app-email.ts` → `supabase.functions.invoke('send-transactional-email')`.
- **Used in:** `VisitDetail`, `InspectionDetail`, `OfferDetail`, `ContractDetail`, `ClientOfferDetail`, `ClientContractDetail`.
- **Flow:** `send-transactional-email` → `enqueue_email` RPC → `process-email-queue` → Resend. Verified working end-to-end earlier today.

### Path 3 — Lifecycle drip (WORKING)
- `lifecycle-email-drip` cron → invokes `send-transactional-email`. Same Resend pipeline.

### Path 4 — Admin DLQ replay (WORKING)
- `admin-email-ops` re-invokes `send-transactional-email`. Same pipeline.

### Path 5 — Bounce/complaint suppression handler (UNUSED but harmless)
- `handle-email-suppression` expects a Lovable/Mailgun-style webhook. Since we're on Resend, this endpoint is never called. Not blocking anything; will be marked inactive in `EMAIL_POLICY.md` and left deployed for a future Resend bounce webhook.

### Path 6 — Custom server flows (already use the Resend pipeline)
- `accept-provider-invite`, `create-provider-invite`, `invite-team-member`, `create-manual-user`, `reset-user-password` — all delegate to `send-transactional-email`. No direct sends anywhere.

## The fix (single root cause)

**Wire `auth-email-hook` as Supabase Auth's "Send Email" hook.** That's the only missing connection. Once registered, every auth email (signup confirm, OTP, recovery, magic link, email change, reauth) flows through the exact same `enqueue_email` → `process-email-queue` → Resend pipeline that already works for app emails.

The hook code itself is already correct: it imports the React Email templates, renders HTML + plain text, enqueues into `auth_emails` (the high-priority queue), and pre-logs a `pending` row in `email_send_log`. It just needs to be invoked, and the signature-verification layer needs to switch from the Lovable HMAC scheme to Supabase's Standard Webhooks scheme.

### Implementation steps

1. **Create the Send Email Hook in Supabase Auth and capture its secret.**
   - In the Supabase Auth dashboard, create the Send Email Hook pointing at `auth-email-hook`. Let Supabase **generate** the signing secret (a `v1,whsec_…` value) — do not invent one by hand.
   - Copy that exact generated value into the `SEND_EMAIL_HOOK_SECRET` runtime secret in Lovable Cloud.
   - This secret is what `auth-email-hook` uses to verify Supabase's Standard Webhooks signature on every incoming auth event. The two values must match exactly or all auth emails will 401.

2. **Update `auth-email-hook/index.ts`** to verify Supabase's Standard Webhooks signature (using `SEND_EMAIL_HOOK_SECRET`) instead of the current Lovable HMAC scheme. Everything else stays untouched — template rendering, the `email_send_log` pre-insert, and the `enqueue_email` call into `auth_emails` are already correct. Only the verification layer changes.

3. **Register the hook with Supabase Auth** via `supabase--configure_auth`:
   - `hook_send_email_enabled = true`
   - `hook_send_email_uri = https://xmklfvepyiiiurokpvub.supabase.co/functions/v1/auth-email-hook`
   - `hook_send_email_secrets = <the secret captured in step 1>`

4. **Deploy** `auth-email-hook`.

5. **End-to-end test:** trigger `auth.resend({ type: 'signup', email: 'sidor.gabriel@gmail.com' })`, confirm `email_send_log` shows `pending` → `sent` within ~5 s, confirm inbox delivery.

6. **Cleanup:**
   - Purge the 5 stale "Emails disabled" entries from `transactional_emails_dlq` so the admin alerts banner goes green.
   - Mark `handle-email-suppression` as "inactive / Resend-pending" in `EMAIL_POLICY.md`. Leave the function deployed.

## What stays exactly the same

- Core flow: Supabase Auth → Send Email Hook → `auth-email-hook` (verify, render, enqueue into `auth_emails`) → `process-email-queue` → Resend.
- No new tables, no new queues, no new cron jobs.
- No secondary email provider, no Lovable email tooling.
- `process-email-queue` continues to drain `auth_emails` ahead of `transactional_emails` (auth priority preserved).
- Every working app-email path (`send-transactional-email`, `lifecycle-email-drip`, `admin-email-ops`, all `sendAppEmail` call sites) is **untouched**.

## Files touched

- Update: `supabase/functions/auth-email-hook/index.ts` (swap signature verification only)
- Update: `supabase/functions/auth-email-hook/deno.json` (drop `@lovable.dev/webhooks-js`, add `npm:standardwebhooks`)
- Add secret: `SEND_EMAIL_HOOK_SECRET` (value generated by Supabase in step 1)
- Configure: Supabase Auth Send Email Hook URL + secret
- Deploy: `auth-email-hook`
- Update: `supabase/functions/_shared/EMAIL_POLICY.md` (mark suppression handler as Resend-pending)

## Summary — key guarantees

- **All auth + app emails now share the same Resend-based queue pipeline** (`enqueue_email` → `process-email-queue` → Resend).
- **The only change for auth is** wiring the Supabase Send Email Hook and verifying its signature with the Supabase-generated `SEND_EMAIL_HOOK_SECRET`.
- **This is a minimal, non-breaking change** focused on making auth emails work reliably, without altering any working app-email flow, queue, cron, or schema.
