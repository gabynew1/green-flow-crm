# Email as a Product System — Phase 2 (Resend-first)

Resend already owns:
- Per-message delivery events (sent, delivered, bounced, complained, opened, clicked)
- Aggregated deliverability stats and reputation
- Domain & DNS health
- Webhook event stream
- Their own dashboard for all of the above

We will **not** replicate any of that. We link out to Resend for raw analytics, and only build the layers Resend can't see: tenants, users, categories, in-app history, and ops controls.

---

## Pillar 1 — Tenant & User Governance (build)

Resend can't know your tenant model. This is the core new capability.

- **`tenant_email_settings`**: per-tenant from-name, reply-to, footer/legal block, logo URL, brand color, locale (EN/RO), per-category enable/disable.
- **`user_email_preferences`**: per-recipient opt-in/out per category (`visit_reminders`, `invoices`, `account`, etc.). Required transactional (password reset, invoice) bypass user prefs but are still logged.
- **Category-aware send pipeline**: `send-transactional-email` adds a 3-step gate before enqueue — global suppression → tenant category toggle → user preference. `category` and `tenant_id` get added to every payload and to `email_send_log`.
- **Provider UI** (Provider Workspace → Settings → Emails): edit branding, toggle categories, preview each template with live tenant branding.
- **Client UI** (Client Portal → Account → Notifications): toggle non-required categories, branded unsubscribe page already exists — extend it to "stop just this category" vs "stop all".

## Pillar 2 — In-App Email History (build)

Resend stores message events but only for ~30 days on lower plans, and tenants/clients can't access the Resend dashboard. We give *them* visibility — without duplicating the analytics.

- **Per-recipient receipt history** in Client Portal: list of emails sent to that user (from `email_send_log`), with subject, timestamp, category, and "view in browser".
- **Webview link** in every email footer: `/emails/view/:messageId` re-renders the same React Email template (token-protected, 30-day expiry).
- **Reason-for-receipt** line at the top of every email body (e.g. *"You're receiving this because your visit on Nov 6 was completed."*).
- **Per-tenant view** in Provider Workspace: their own emails only, scoped by `tenant_id` — no global stats, no deliverability metrics.

That's it for in-app data — anything beyond this (open rates, bounce reasons, raw events) is a deep link to Resend.

## Pillar 3 — Resend as the Source of Truth (link, don't copy)

- **`/admin/emails` (SuperAdmin) is just a launcher**: a small page with deep links to the Resend dashboard sections (Emails, Domains, Webhooks, Audience), plus the few things Resend doesn't track:
  - Internal queue depth (`auth_emails`, `transactional_emails` pgmq queues)
  - DLQ inspector with retry/discard
  - Tenant/category filters on `email_send_log` (only sends originated by *us*, no analytics)
- **No bounce/complaint dashboards, no reputation graphs, no per-message event timeline** — those live in Resend.
- **One Resend webhook → one purpose**: keep the existing `handle-email-suppression` to mirror *only* hard bounces and complaints into `suppressed_emails` so the send pipeline can block them. Nothing else from the webhook is stored.

## Pillar 4 — Safe Operations (build)

These are workflow controls that have no equivalent in Resend.

- **Kill switch per template & per tenant** — pauses sends instantly without code changes.
- **Template versioning + test-send + publish flow**: edits are drafts; SuperAdmin publishes. Test-send button uses Resend's normal API.
- **Replay**: SuperAdmin can re-send any logged email (subject to suppression).
- **Audit log** (`email_admin_audit`): every kill-switch toggle, manual replay, settings change, with actor + before/after.

---

## What we explicitly are NOT building

- ❌ Bounce / complaint / open / click stats — view in Resend
- ❌ Domain or DNS health UI — view in Resend
- ❌ Per-message delivery event timeline — view in Resend
- ❌ Sender-reputation scoring or auto-pause on bounce rate — Resend's job
- ❌ Mirroring webhook events into a custom `email_events` table — only the suppression signal we actually need
- ❌ Engagement-based suppression — Resend already exposes this

---

## Suggested rollout order

1. **Pillar 1 (Governance)** — tenant settings + user preferences + category gate. The big unlock for multi-tenant. ~1–2 builds.
2. **Pillar 2 (In-app history)** — webview, receipts, reason-for-receipt. ~1 build.
3. **Pillar 3 (Resend launcher)** — small SuperAdmin page with deep links + queue/DLQ tools. ~½ build.
4. **Pillar 4 (Safe ops)** — kill switches, versioning, replay, audit. ~1 build.

---

## Technical notes

- **New tables**: `tenant_email_settings`, `user_email_preferences`, `email_template_versions`, `email_admin_audit`. RLS-scoped (tenant or super-admin).
- **`email_send_log` gets**: `tenant_id`, `category`, `template_version_id`. Still the only "log" we keep — used for in-app history and ops, not analytics.
- **`send-transactional-email` changes**: 3-gate check before enqueue; accepts `category` and `tenantId`; stamps version.
- **No new webhook handlers, no new aggregation cron, no new analytics tables.**

---

## What I need from you

Confirm Pillar 1 (Governance) as the starting point, or pick another. If Resend's dashboard gives your support team enough on its own, we can also drop Pillar 3 entirely and just put a single "Open in Resend" button somewhere in the SuperAdmin area.
