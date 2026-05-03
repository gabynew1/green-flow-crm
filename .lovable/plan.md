# Phase 2 — Wire `auth-email-hook` to Supabase Auth (corrected)

## Reality check (what changed since the original plan)

Reading the current code + secrets + DB tells a different story than the prior plan assumed:

1. `auth-email-hook` verifies signatures with **`LOVABLE_API_KEY`** using `@lovable.dev/webhooks-js` and parses payloads with `parseEmailWebhookPayload`. That is the **Lovable Email** webhook contract, not Supabase Auth's native "Send Email Hook" contract.
2. `SEND_EMAIL_HOOK_SECRET` is **not** in project secrets.
3. `email_send_log` shows **zero** auth-template rows ever (`signup`, `recovery`, `magiclink`, `invite`, `email_change`, `reauthentication`, `auth_emails` — all empty). Only manual `test-*` transactional sends exist. So Supabase Auth is currently sending emails through its **default** path (or not at all), not through our hook.
4. Project policy (`mem://`, `EMAIL_POLICY.md`) forbids the Lovable Email tooling. So the fix is **not** "register this as a Lovable Email hook" — it's "make this function speak Supabase Standard Webhooks and register it in Supabase Auth."

That means Phase 2 is bigger than originally scoped. It's a code change, a secret, and a config switch — not just a smoke test.

## Scope of Phase 2

Make Supabase Auth's "Send Email Hook" call our `auth-email-hook`, have the function verify the request with the Standard Webhooks signature Supabase sends, then enqueue exactly as it does today.

### Step 1 — Switch `auth-email-hook` to Standard Webhooks verification

File: `supabase/functions/auth-email-hook/index.ts`

- Drop the `@lovable.dev/webhooks-js` + `verifyWebhookRequest` + `parseEmailWebhookPayload` path for the main webhook handler.
- **Keep** `npm:@lovable.dev/email-js` import only if still needed for the payload TypeScript shape; per `EMAIL_POLICY.md` it must not be removed blindly. Re-evaluate during implementation — if it is only used for the parser we are dropping, leave a comment explaining why we keep the import (policy), and stop calling it.
- Add a Standard Webhooks verifier using `npm:standardwebhooks@1` (lightweight, no Lovable coupling):
  - Read `Deno.env.get('SEND_EMAIL_HOOK_SECRET')` (a base64 secret prefixed `v1,whsec_…` as Supabase emits).
  - Construct `new Webhook(secret)` and call `wh.verify(rawBody, headers)` where headers are `webhook-id`, `webhook-timestamp`, `webhook-signature`.
  - On failure → 401 with no log row (matches current behavior).
- Replace the Lovable payload shape with Supabase's:
  ```ts
  // Supabase Auth Send Email Hook payload
  {
    user: { id, email, ... },
    email_data: {
      token, token_hash, redirect_to, email_action_type, // signup | recovery | magiclink | invite | email_change | reauthentication
      site_url, token_new, token_hash_new
    }
  }
  ```
  Map `email_action_type` → existing `EMAIL_TEMPLATES` keys (already aligned: `signup`, `recovery`, `magiclink`, `invite`, `email_change`, `reauthentication`).
- Build `confirmationUrl` from `site_url + /auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<redirect_to>` per Supabase docs. For `reauthentication`, surface `token` (OTP) directly.
- `run_id` is Lovable-specific and not in Supabase's payload — generate one locally (`crypto.randomUUID()`) for log correlation, since downstream `enqueue_email` already accepts whatever we pass.
- Everything from line ~220 onward (template render → `email_send_log` pending insert → `enqueue_email` to `auth_emails` queue) stays unchanged.

### Step 2 — Configure the secret + register the hook

Two things that must happen outside code (I'll prep them and you click through):

a. Add runtime secret `SEND_EMAIL_HOOK_SECRET` (base64 value, format `v1,whsec_<base64>`). I'll request it via `add_secret` once you approve.

b. In Cloud → Auth → Hooks → "Send Email Hook":
   - Enable
   - URL: `https://xmklfvepyiiiurokpvub.functions.supabase.co/auth-email-hook`
   - Secret: paste the same value as `SEND_EMAIL_HOOK_SECRET`
   - Save.

`supabase/config.toml` should also declare the hook so the setting is reproducible:
```toml
[auth.hook.send_email]
enabled = true
uri = "https://xmklfvepyiiiurokpvub.functions.supabase.co/auth-email-hook"
secrets = "env(SEND_EMAIL_HOOK_SECRET)"
```

### Step 3 — Smoke test, end-to-end

1. Sign up a fresh test address from the live preview.
2. Within 30s, expect a row in `email_send_log` with `template_name='signup'`, status transitioning `pending → sent`.
3. Resend tab in the connector dashboard shows the corresponding delivery.
4. Click the link in the email → user lands on `/provider`, banner does not render (Phase 1 regression check).
5. Trigger a password reset against the same user → row appears with `template_name='recovery'`.
6. Replay the same webhook with a tampered signature via `supabase--curl_edge_functions` → expect 401, no log row.

### Step 4 — Fix the transient `useAuth must be used within AuthProvider` runtime error

Surfaced in the current preview. Read `src/App.tsx` (`AppRoutes` mount order) and ensure `<AuthProvider>` wraps `AppRoutes` at all times — likely a hot-reload artifact, but worth a defensive assertion + a top-level `<AuthProvider>` placement audit. No behavior change for normal traffic.

## Out of scope for Phase 2 (still queued for Phase 3+)

- Subdomain split (`updates@…` for lifecycle).
- DMARC promotion at the root.
- Observability widgets on `/admin/emails`.
- Deno tests for the hook (will land in Phase 5 alongside the new payload shape).

## What I need from you

- Approval to switch the hook from the Lovable Email contract to Supabase Standard Webhooks (Step 1) — this is a non-trivial change but it's the only way auth emails actually flow with our Resend-only policy.
- The `SEND_EMAIL_HOOK_SECRET` value, OR approval to generate one and have you paste it into Supabase Auth → Hooks. I'll request it via `add_secret` once you say go.
- 2 minutes after deploy to do the live signup smoke test together.

Approve and I'll execute Steps 1, 2a (request the secret), 4, then pause for you to do 2b before we run Step 3.
