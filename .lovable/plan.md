# Lock In Resend as the Single Email Provider — Stop the Drift

## The actual root cause of the recurring drift

Three things keep pulling the agent (and any LLM-assisted edit) back toward Lovable Emails on email-related tasks:

1. **Memory entry is too soft.** `mem://infrastructure/email-setup` says "Email delivery is integrated with Resend.com" but does NOT say "Lovable Emails / Supabase managed email tooling is forbidden — never call `setup_email_infra`, `scaffold_auth_email_templates`, `scaffold_transactional_email`, or `toggle_project_emails`." Without an explicit prohibition, the platform's own knowledge files (which strongly recommend Lovable Emails by default) win every time.
2. **Stale references in the live code.** Two files still contain Lovable-era artifacts that look authoritative on inspection:
   - `supabase/functions/auth-email-hook/index.ts` imports `npm:@lovable.dev/email-js` (still used for parsing the Supabase auth webhook payload — legit — but reads as "we use Lovable email infra" at a glance).
   - `supabase/migrations/20260318195259_email_infra.sql` is the original Lovable-style infra migration, still committed.
3. **No repo-level "READ ME FIRST" for email work.** When the agent opens an email-related file, nothing in the repo screams "Resend only — do not re-introduce Lovable tooling." So on every fresh task, the platform's default email guidance (which assumes Lovable Emails) takes over again.

The `.lovable/plan.md` file containing the Lovable-flavored plan from a prior session is part of the noise but not the cause; once the locks below are in place, plans drift back to Resend even if `plan.md` doesn't.

---

## Plan (in priority order)

### Step 1 — Add a hard prohibition to the Core memory rules (P0)

Add a one-liner to **`mem://index.md` → Core** so it is in context on every single agent loop:

> Emails: **Resend ONLY** via the Resend connector + `process-email-queue`. NEVER use Lovable Email tooling. Forbidden tools: `email_domain--setup_email_infra`, `email_domain--scaffold_auth_email_templates`, `email_domain--scaffold_transactional_email`, `email_domain--toggle_project_emails`. Forbidden domains: `notify.greengrasscrm.ro` (stale, do not reference). Sender domain: `send.greengrasscrm.ro`.

Core rules apply to every action — this is the strongest possible signal short of a code-level guard.

### Step 2 — Rewrite `mem://infrastructure/email-setup` to be prescriptive, not descriptive (P0)

Replace the current soft description with a strict policy doc:

- **Provider:** Resend, accessed via the Lovable connector gateway (`https://connector-gateway.lovable.dev/resend/emails`).
- **Auth:** `RESEND_API_KEY` (managed connector secret) + `LOVABLE_API_KEY`.
- **Sender domain (verified in Resend):** `send.greengrasscrm.ro`.
- **Pipeline:** caller → `enqueue_email` RPC → `pgmq` queue (`auth_emails` / `transactional_emails`) → `process-email-queue` cron → Resend.
- **Auth emails:** Supabase Auth webhook → `auth-email-hook` (renders React Email template, calls `enqueue_email`). The `@lovable.dev/email-js` import is for **parsing the Supabase webhook payload only** — not for sending.
- **Forbidden tools and patterns** (explicit list, with reasons).
- **When you need a new email type:** add a template under `supabase/functions/_shared/transactional-email-templates/`, register in `registry.ts`, invoke `send-transactional-email` from the client. Do NOT scaffold via Lovable tools, do NOT create a new edge function per email type.
- **Failure mode reference:** Resend HTTP 403 means "API key not scoped to `send.greengrasscrm.ro`" — NOT "Lovable Emails disabled" (the legacy error string in `process-email-queue` is misleading; see Step 4).

### Step 3 — Add a repo-level constraint doc the agent will see when touching email code (P0)

Create `supabase/functions/_shared/EMAIL_POLICY.md` with the same strict policy. Why this location: any time the agent opens an email-related edge function, it lists the directory and sees this file. It also acts as documentation for human collaborators.

The file will:
- State the Resend-only rule in the first three lines (no preamble).
- List forbidden tools and forbidden domain references.
- Explain the `@lovable.dev/email-js` exception (parsing only, not sending).
- Point readers to `mem://infrastructure/email-setup` as the source of truth.
- Include an "If you are an LLM editing email code" section with explicit do / don't rules.

### Step 4 — Fix the misleading "Emails disabled for this project" string in `process-email-queue` (P1)

This string is the #1 reason a debugger thinks "oh, Lovable Emails is off, let me re-enable it." Replace the hardcoded `'Emails disabled for this project'` DLQ reason with the actual Resend response body (truncated). This eliminates the diagnostic landmine that started this whole conversation.

Update `supabase/functions/process-email-queue/index.ts` lines 325-331:
- Log `Resend API 403: <body>` instead of `Emails disabled for this project`.
- Add a 1-line comment above explaining: 403 from Resend = API key scope mismatch, NOT Lovable kill switch.

### Step 5 — Rename and annotate the legacy migration file (P2, lightweight)

`supabase/migrations/20260318195259_email_infra.sql` is the original Lovable-style infra setup. We can't rename or rewrite it without breaking migration history, but we can add a sibling `supabase/migrations/README.md` (or a top-of-file SQL comment via a no-op migration) noting:

> This migration set up the original Lovable-style email queue. The project is now Resend-only. The pgmq queue and `enqueue_email` RPC remain in use; ignore any references in this file to Lovable Email tools.

Lightweight, but it neutralizes a future agent's "oh, Lovable infra is set up here" misread.

### Step 6 — Clean up `.lovable/plan.md` (P2)

This file currently contains the Phase 1-6 plan that mentions Lovable Email tooling. Either:
- Delete it (cleanest), or
- Replace its contents with the latest Resend-aligned plan from this conversation.

I'll go with **delete** unless you want to keep it as historical record.

### Step 7 — Verify by simulating the next email task (P1)

After the locks are in, I'll do a dry-run mental check: imagine a fresh agent loop opening "I need to send a new transactional email when X happens." Walk through what the agent reads (Core memory, `EMAIL_POLICY.md`, the existing `send-transactional-email` function) and confirm there is no path that leads back to Lovable tooling. If any path still leads there, add another lock.

---

## What this does NOT do (intentionally)

- Does NOT remove the `notify.greengrasscrm.ro` Lovable email domain entry from Cloud → Emails. That is a workspace-level setting; you can delete it from the Cloud panel at your leisure. It does not affect Resend sends.
- Does NOT touch the existing email pipeline code beyond Step 4's error-message fix. The pipeline is correct; only the policy/documentation/error-string drift around it is the problem.
- Does NOT remove the `@lovable.dev/email-js` import from `auth-email-hook` — it is correctly used for webhook payload parsing, not for sending. We just document that fact loudly so it doesn't get misread.
- Does NOT solve the actual "no emails arriving" problem from the previous turn — that is a separate Resend domain-verification issue. After this plan locks in the policy, we'll resume that fix in a follow-up.

---

## Files I will change

| File | Change |
|---|---|
| `mem://index.md` | Add 1-line Core rule prohibiting Lovable Email tooling |
| `mem://infrastructure/email-setup` | Rewrite to prescriptive Resend-only policy |
| `supabase/functions/_shared/EMAIL_POLICY.md` | **New** repo-level constraint doc |
| `supabase/functions/process-email-queue/index.ts` | Replace misleading 403 error string |
| `supabase/migrations/README.md` | **New** annotation of legacy `email_infra.sql` |
| `.lovable/plan.md` | Delete (or replace with Resend-aligned plan) |

---

## Decisions I need from you before implementing

1. **`.lovable/plan.md`** — delete it, or rewrite with the Resend-aligned plan?
2. **Lovable email domain `notify.greengrasscrm.ro`** — leave it alone (recommended) or do you want me to add it to a "manual cleanup" list in the policy doc?
3. **Stale Lovable templates under `supabase/functions/_shared/email-templates/`** (signup.tsx, magic-link.tsx, etc.) — these are still actively used by `auth-email-hook` and rendered into Resend sends, so they stay. Just confirming.

After you answer (or say "your call on all three"), I'll execute the plan in build mode.
