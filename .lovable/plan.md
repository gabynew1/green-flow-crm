## Pillar 2 — In-App Email History + Webview + 1-Year Retention

Build recipient-facing transparency on top of `email_send_log` and Pillar 1 governance. All email history is retained for **365 days**, then automatically deleted.

### What gets built

**1. Webview rendering of past emails**
- New edge function `render-email-webview` — takes a `messageId`, looks up the latest `email_send_log` row, re-renders the React Email template using stored `template_name` + `template_data`, returns sanitized HTML.
- Auth gate: only the original recipient (matched by `auth.users.email`) or a tenant `full_admin` can view it.
- New route `/emails/view/:messageId` — minimal layout, white background, "Sent on ... to ..." header, then the email rendered in a sandboxed iframe.
- Returns 404 for emails older than 365 days (already deleted by retention job).

**2. Persist template data for re-rendering**
- Migration: add `template_data jsonb` column to `email_send_log` (`category` + `tenant_id` already exist from Pillar 1).
- Update `send-transactional-email` to write `template_data` into the `pending` row.
- Sender injects a "View in browser" link + "You're receiving this because <category label>" line above the system unsubscribe footer (single source — never inside template files).

**3. Client Portal — Email History**
- New page `src/pages/client/ClientEmailHistory.tsx`, linked from Profile.
- Lists the logged-in user's emails (deduplicated by `message_id`, latest status only). Columns: Date, Subject, Category badge, Status badge, "View" link.
- Filters: category dropdown, time range (7d / 30d / 90d / 365d).
- Header note: "Emails are kept for 1 year, then permanently deleted."
- Backed by SECURITY DEFINER RPC `get_my_email_history(limit, offset, category, since)` filtering on `recipient_email = auth.email()`.

**4. Provider Workspace — Customer email history**
- New "Emails" tab on `CustomerDetail.tsx` showing all emails sent to that customer's email within the current tenant.
- Same dedup + columns. RPC `get_customer_email_history(customer_id)` enforces tenant isolation.

**5. 1-year retention (auto-delete)**
- Migration adds index `email_send_log(created_at)` to make the purge cheap.
- New SQL function `purge_old_email_logs()` — `DELETE FROM email_send_log WHERE created_at < now() - interval '365 days'` returning the deleted row count.
- pg_cron job `purge-email-logs-daily` — runs daily at 03:00 UTC, executes the function, logs deleted count to `super_admin_audit_logs` (`action='email_log_purge'`).
- Header banner in both history views: "Emails older than 1 year are automatically deleted."
- Webview gracefully shows "This email is no longer available (kept for 1 year)" when not found.

### Technical details

```text
Per send:
  trigger UI ──▶ send-transactional-email
                   ├─ governance gate (Pillar 1)
                   ├─ render template + inject "View in browser" link
                   ├─ insert email_send_log {pending, template_data, category, tenant_id, message_id}
                   ├─ enqueue → process-email-queue → Lovable Email API
                   └─ insert email_send_log {sent|failed, same message_id}

Daily 03:00 UTC:
  pg_cron → purge_old_email_logs()
            └─ DELETE WHERE created_at < now() - 365 days
            └─ INSERT super_admin_audit_logs {action:'email_log_purge', metadata:{deleted_count}}

Webview:
  GET /emails/view/:messageId
    └─ render-email-webview verifies caller owns email OR is tenant admin
    └─ loads latest log row (404 if purged) → re-renders → returns HTML
```

**Files to create**
- `supabase/functions/render-email-webview/index.ts`
- `src/pages/EmailWebview.tsx` (route `/emails/view/:messageId`)
- `src/pages/client/ClientEmailHistory.tsx`
- `src/components/provider/CustomerEmailHistoryTab.tsx`
- 1 migration: `template_data` column, index on `created_at`, `purge_old_email_logs()` function, 2 SECURITY DEFINER RPCs, RLS

**Files to edit**
- `supabase/functions/send-transactional-email/index.ts` — persist `template_data`, inject webview link + reason-for-receipt line
- `src/App.tsx` — register `/emails/view/:messageId`
- `src/pages/client/ClientProfile.tsx` — link to Email History
- `src/pages/provider/CustomerDetail.tsx` — add Emails tab

**Cron setup**
- Schedule via insert tool (uses project URL + anon key) per the scheduled-functions pattern. Job: `purge-email-logs-daily`, expression `0 3 * * *`, calls `select purge_old_email_logs();` directly via `cron.schedule` (SQL form, no edge function needed).

**Security**
- Webview validates JWT, uses service role to fetch the row, then verifies `recipient_email == auth.email()` OR `has_role(auth.uid(), 'full_admin')` scoped to the row's `tenant_id`.
- RPCs are SECURITY DEFINER with `SET search_path = public`, never trust client-supplied email/customer_id beyond tenant scope.
- iframe rendered with `sandbox="allow-same-origin"` only; React auto-escapes all `template_data` props.

**Out of scope (later pillars)**
- SuperAdmin Resend launcher (Pillar 3)
- Kill switches, template versioning, manual replay (Pillar 4)

### Suggested execution order
1. Migration (column, index, purge function, RPCs) + cron job
2. Sender updates (template_data, webview link, reason line) + redeploy
3. `render-email-webview` + `/emails/view/:messageId` route
4. Client Portal Email History page
5. Provider Customer Emails tab
6. Smoke test one send end-to-end; verify dedup, webview, and 365d retention banner
