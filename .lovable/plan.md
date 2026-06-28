
# Pre-deployment Test Plan — Trial Overhaul & Entitlements

Scope: everything shipped this session (DB migrations for `plan_entitlements` / `entitlement_keys` / `plan_entitlement_values` / `trial_consumed_identities`, `fn_init_provider_tenant`, `fn_expire_trials`, `fn_grant_extra_trial`, `fn_get_tenant_entitlements`, `fn_set_entitlement`, `useEntitlements` hook, `/admin/plans` matrix, `TrialBanner` copy, `lifecycle-cron` trial expiry call).

## 1. Database / RPC tests (run via SQL console, no UI needed)

1. **Entitlement resolver sanity**
   - Call `fn_get_tenant_entitlements(<patio tenant>)` → expect tier `patio`, `max_teams=0`, `ai_tier=none`.
   - Same on a `territory_trial` tenant → expect Territory-level values.
   - On a tenant whose `trial_ends_at` is in the past but still flagged trial → expect Patio values (resolver must treat expired trial as Patio even before cron runs).

2. **Trial eligibility / dedupe**
   - Insert a fake profile reusing the email of an existing tenant's billing contact → run `fn_init_provider_tenant` → expect Patio assignment, no `territory_trial` granted, row in `trial_consumed_identities` unchanged.
   - Insert with a fresh email + fresh CUI → expect 30-day trial, new fingerprint rows for email + CUI + company + phone.
   - Insert with fresh email but reused CUI → expect Patio (CUI fingerprint match).

3. **Expiry cron**
   - Manually set one trial tenant's `trial_ends_at = now() - interval '1 hour'`.
   - Run `select fn_expire_trials();` → expect return count = 1, tenant downgraded to `patio`, `feature_flags.trial_grace` set, no rows deleted from `teams`, `properties`, `contracts`, `service_orders`.
   - Re-run → expect 0 (idempotent).

4. **Soft-lock data preservation**
   - Pick a trial tenant with 3 teams + AI usage. Force expire. Confirm:
     - All 3 teams still selectable in DB and visible in UI.
     - `fn_get_tenant_entitlements` now returns `max_teams=0`.
     - Existing rows untouched; only new creation should be blocked.

5. **`fn_set_entitlement` audit + auth**
   - Call as super admin → succeeds, row in `super_admin_audit_logs`.
   - Call as regular user via supabase client → expect permission denied.

6. **`fn_grant_extra_trial`**
   - Pick a tenant on Patio with consumed fingerprints → call RPC with 14 days → expect tenant flipped to `territory_trial`, `trial_ends_at = now()+14d`, audit log written, fingerprints untouched.

## 2. Edge function tests

1. `lifecycle-cron` (curl) → response JSON includes `trials_expired` integer; no 500s; logs show fn_expire_trials returned.
2. `create-manual-user` regression: signup of a brand-new provider triggers `fn_init_provider_tenant` path (30-day trial) and signup of a known/reused identity falls to Patio. Verify via `tenants.subscription_tier` immediately after.
3. `send-transactional-email` super-admin signup + welcome emails still fire (verify via `email_send_log` rows for a new signup).

## 3. Frontend smoke (Playwright on localhost)

1. **Super Admin `/admin/plans`**
   - Loads, renders 4 tier columns × all entitlement rows.
   - Edit `max_teams` for Backyard from 2 → 3, click Save, reload → value persists, audit log entry exists.
   - Toggle a boolean key, save, reload → persists.
   - Sign in as a non-super-admin → `/admin/plans` redirects / shows forbidden.

2. **Provider on trial**
   - `TrialBanner` renders "Your full-access trial ends in N days" with correct N.
   - `TeamManager`: at Territory-trial capacity, can create team up to `max_teams` from entitlements; UI uses `useEntitlements()` value.

3. **Provider post-expiry (use a forced-expired tenant)**
   - Banner shows the Patio soft-lock copy with upgrade CTA.
   - Existing teams visible & editable. "Add team" button disabled with tooltip + upgrade CTA. No data loss visible.
   - AI features hidden/disabled per Patio entitlements.

4. **Client portal unaffected**
   - Login as a client user → no banner change, no broken routes.

## 4. Regression / build gates

- `bunx tsgo --noEmit` (already green).
- `bunx vitest run` if any unit tests exist around `useEntitlements` or tier helpers.
- `supabase--linter` to catch any RLS gap on the 4 new tables.
- Manual check: every `GRANT` exists on `plan_entitlements`, `entitlement_keys`, `plan_entitlement_values`, `trial_consumed_identities` (authenticated + service_role; anon only where matrix should be publicly visible — likely none).

## 5. Production safety checks before publishing frontend

- Confirm backfill numbers: count of tenants on `territory_trial` with `trial_ends_at` ≈ now()+30d matches expected active tenant count.
- Confirm no tenant ended up on a tier value not in the constraint list.
- Spot-check 2 real tenants (1 provider trial, 1 long-time customer) to confirm `fn_get_tenant_entitlements` returns sensible values.
- Verify `lifecycle-cron` schedule is wired (pg_cron entry exists and is `active`).

## Suggested order

1. SQL/RPC tests (section 1) — fastest, catches schema/logic bugs.
2. Edge function curl tests (section 2).
3. Playwright smoke for `/admin/plans` and trial banner (section 3).
4. Linter + typecheck (section 4).
5. Production safety spot checks (section 5).
6. Publish frontend.

If you approve, I can execute sections 1–4 automatically in build mode and report results before you click Publish.
