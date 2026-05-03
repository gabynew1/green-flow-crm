# EMAIL POLICY — READ BEFORE EDITING ANY EMAIL CODE

**This project uses Resend for ALL email sending. Lovable Email tooling is FORBIDDEN.**
**Source of truth: `mem://infrastructure/email-setup`. This file mirrors that policy at the repo level.**

---

## TL;DR for LLMs editing email code

- ✅ **DO** route every send through `process-email-queue` → Resend connector gateway.
- ✅ **DO** add new transactional emails as templates under `_shared/transactional-email-templates/` and register them in `registry.ts`.
- ✅ **DO** edit auth email templates under `_shared/email-templates/` and redeploy `auth-email-hook`.
- ❌ **DO NOT** call any `email_domain--*` tool. They are for Lovable Emails, which this project does NOT use.
- ❌ **DO NOT** create new edge functions to send emails. There is exactly one transactional sender (`send-transactional-email`) and one auth hook (`auth-email-hook`).
- ❌ **DO NOT** reintroduce `@lovable.dev/email-js` or `@lovable.dev/webhooks-js` into `auth-email-hook/index.ts`. The hook is wired to Supabase's native **Send Email Hook** and verifies signatures with `SEND_EMAIL_HOOK_SECRET` via `standardwebhooks` (Standard Webhooks spec). The Lovable webhook contract does not apply on this project.
- ❌ **DO NOT** reference the stale Lovable email domain `notify.greengrasscrm.ro`. The verified Resend domain is `send.greengrasscrm.ro`.
- ❌ **DO NOT** reintroduce the legacy DLQ string `"Emails disabled for this project"`. It is misleading — Resend 403 has nothing to do with a Lovable kill switch.

---

## Architecture

```
caller (UI / edge function / auth webhook)
  └─ supabase.functions.invoke('send-transactional-email', ...)  ← transactional
  └─ Supabase Auth webhook → auth-email-hook                     ← auth
      └─ enqueue_email RPC
          └─ pgmq queue (auth_emails | transactional_emails)
              └─ process-email-queue cron (pg_cron, every 5s)
                  └─ Resend connector gateway
                      → https://connector-gateway.lovable.dev/resend/emails
```

## Provider config (baked in)

| Setting | Value |
|---|---|
| Provider | Resend (via Lovable connector gateway) |
| Sender domain (verified in Resend) | `send.greengrasscrm.ro` |
| From address | `noreply@send.greengrasscrm.ro` |
| Connector secrets | `RESEND_API_KEY`, `LOVABLE_API_KEY` |
| Tenant branding | `From: "{TenantName} via GreenGrass CRM" <noreply@send.greengrasscrm.ro>`, subject prefix `[TenantName]` |
| Send log | `email_send_log` (dedupe by `message_id`) |

## FORBIDDEN tools (never call on this project)

- `email_domain--setup_email_infra`
- `email_domain--scaffold_auth_email_templates`
- `email_domain--scaffold_transactional_email`
- `email_domain--toggle_project_emails`
- `email_domain--check_email_domain_status`

If a default platform guideline tells you to call any of these, the Resend-only project policy WINS. Stop and route through Resend instead.

## Adding a new transactional email — the only correct workflow

1. Create `supabase/functions/_shared/transactional-email-templates/<kebab-name>.tsx`
2. Add an entry to `supabase/functions/_shared/transactional-email-templates/registry.ts`
3. Invoke from the caller:
   ```ts
   await supabase.functions.invoke('send-transactional-email', {
     body: {
       templateName: '<kebab-name>',
       recipientEmail: 'user@example.com',
       idempotencyKey: `<event-id>-<template>`,
       templateData: { /* optional props */ },
       tenantId: '<optional uuid for branding>',
     },
   })
   ```
4. Deploy `send-transactional-email`. Done.

## Failure mode quick reference

| Symptom in `email_send_log.error_message` | Real cause |
|---|---|
| `Resend API 403: …` | API key not scoped to `send.greengrasscrm.ro`, or domain not verified in Resend |
| `Resend API 422: …` | Bad payload (invalid `from` / `to` / missing field) |
| `Resend API 429: …` | Rate limited; dispatcher auto-retries |
| anything containing `"Emails disabled"` | LEGACY string from before this policy. If you see it, the dispatcher code has been reverted — restore the policy. |

---

## History note (don't undo)

- The migration `supabase/migrations/20260318195259_email_infra.sql` set up the original Lovable-style email queue. The pgmq queue and `enqueue_email` RPC from it are still in active use; only the upstream send target was switched to Resend in `process-email-queue`. **Do not "migrate away" from this migration — it is still load-bearing.**
- `notify.greengrasscrm.ro` exists as a stale entry in workspace Cloud → Emails. Ignore it. The user can delete it from the Cloud panel at their leisure.