## Overview
Refactor trial expiry into a general subscription lifecycle: separate **tier** (what they own) from **subscription_status** (where they are in billing), keep entitlement resolution in one RPC, add grace period + manual/auto downgrade, and lay foundations for payments/suspensions later.

---

## Step 1 — Schema foundation
Single migration:

1. Create ENUM `public.subscription_status_t` (`trial_active`, `grace`, `active`, `downgraded`, `suspended`, `cancelled`). ENUM chosen over CHECK: type-safe, one place to extend, cheap to `ALTER TYPE ADD VALUE` when payment-failure states arrive.
2. `ALTER TABLE public.tenants` — `ADD COLUMN subscription_status subscription_status_t NULL` (no default — see Step 2), `ADD COLUMN grace_ends_at timestamptz NULL`.
3. Backfill in same migration:
   - `territory_trial` + `trial_expires_at > now()` → `trial_active`
   - `territory_trial` + expired → `grace`, `grace_ends_at = now() + interval '15 days'`
   - everything else → `active`
4. `ALTER COLUMN subscription_status SET NOT NULL` after backfill (no default — inserts must be explicit).
5. Indexes for cron scans:
   - `CREATE INDEX idx_tenants_sub_status ON public.tenants (subscription_status);`
   - `CREATE INDEX idx_tenants_grace_ends_at ON public.tenants (grace_ends_at) WHERE grace_ends_at IS NOT NULL;`
   - `CREATE INDEX idx_tenants_trial_expiry ON public.tenants (trial_expires_at) WHERE subscription_status = 'trial_active';`
6. `subscription_config` singleton table: `id smallint PK CHECK (id=1)`, `grace_period_days int NOT NULL DEFAULT 15`, `trial_length_days int NOT NULL DEFAULT 30`. Seed row. Grants for `service_role`.

---

## Step 2 — Guarantee valid tier/status at every creation path
Same migration:

1. Add trigger `trg_tenants_validate_lifecycle` (BEFORE INSERT/UPDATE) enforcing invariants:
   - `subscription_status='trial_active'` ⇒ `subscription_tier='territory_trial' AND trial_expires_at > now()`
   - `subscription_status='grace'` ⇒ `subscription_tier='territory_trial' AND grace_ends_at IS NOT NULL`
   - `subscription_status='active'` ⇒ `subscription_tier <> 'territory_trial'`
   - `subscription_status='downgraded'` ⇒ `subscription_tier = 'patio'`
   - RAISE on invalid combos.
2. Update `fn_init_provider_tenant` to explicitly set `subscription_status = 'trial_active'` when granting trial, and `'active'` when denied and defaulted to Patio.
3. Update `supabase/functions/create-manual-user/index.ts` insert (`subscription_tier: "free"`… bug — currently `"free"` isn't a valid tier) → set `subscription_tier: 'patio', status: 'active', subscription_status: 'active'`.
4. Grep all other tenant inserts (bootstrap script, edge functions) to confirm explicit lifecycle.

---

## Step 3 — Lifecycle RPCs (idempotent, audit-rich)
Same migration:

1. **`fn_get_tenant_entitlements(p_tenant_id)`** — after loading `subscription_tier` + `subscription_status`, compute `effective_tier = CASE WHEN subscription_status='grace' THEN 'patio' ELSE subscription_tier END`. Resolve `plan_entitlement_values` against `effective_tier`. Return `{ tier, effective_tier, subscription_status, grace_ends_at, trial_expires_at, entitlements }`. This is the only place lifecycle affects permissions.
2. **`fn_finalize_downgrade(p_tenant_id, p_reason text)`** NEW, `SECURITY DEFINER`, super-admin OR service_role only:
   - Idempotent: no-op if `subscription_status NOT IN ('trial_active','grace')`.
   - Sets `subscription_tier='patio'`, `subscription_status='downgraded'`, `grace_ends_at=NULL`, `trial_expires_at=NULL`; runs `apply_tier_limits(_, 'patio')`.
   - Emits transition audit (see Step 5).
3. **`fn_expire_trials()`** (kept for cron compat) rewritten as two-pass:
   - Pass A: `trial_active AND trial_expires_at <= now()` → set `subscription_status='grace'`, `grace_ends_at = now() + config.grace_period_days`. Audit `trial_expired`.
   - Pass B: `grace AND grace_ends_at <= now()` → `fn_finalize_downgrade(id, 'automatic_downgrade')`.
   - Returns counts per pass.
4. **`fn_change_subscription_tier(p_tenant_id, p_tier)`** rewritten:
   - Any upgrade out of `trial_active` or `grace` atomically clears both (`subscription_status='active'`, `grace_ends_at=NULL`, `trial_expires_at=NULL`).
   - Downgrade to `patio` funnels through `fn_finalize_downgrade` with reason `manual_downgrade` (single downgrade path).
   - Emits transition audit.
5. **`fn_grant_extra_trial(tenant, days, reason)`** — set `subscription_status='trial_active'`, `grace_ends_at=NULL`, extend `trial_expires_at`. Audit `trial_extended`.
6. **Drop** `extend_trial_15` (redundant).

---

## Step 4 — Cron / edge functions
- `supabase/functions/lifecycle-cron/index.ts` already calls `fn_expire_trials`; no code change (behavior now two-pass inside RPC). Log both pass counts.

---

## Step 5 — Structured audit logs
1. Migration: `ALTER TABLE public.super_admin_audit_logs ADD COLUMN IF NOT EXISTS from_status text, from_tier text, to_status text, to_tier text;` (metadata jsonb already exists — keep it, but promote hot fields).
2. Helper `fn_log_subscription_transition(p_tenant_id, p_from_status, p_to_status, p_from_tier, p_to_tier, p_reason, p_actor uuid, p_metadata jsonb)` used by every RPC above. Actor = `auth.uid()` when present, else `NULL` (cron/service).
3. Fixed reason vocabulary: `trial_started`, `trial_extended`, `trial_expired`, `manual_downgrade`, `automatic_downgrade`, `upgrade`, `payment_failure` (reserved), `manual_reactivation` (reserved).
4. Backfill isn't required — historical audits stay in `metadata`.

---

## Step 6 — Frontend refactor
1. `src/hooks/useEntitlements.ts` — surface `tier`, `effectiveTier`, `subscriptionStatus`, `graceEndsAt`, `graceDaysRemaining`, `isInGrace`, `isOnTrial` from the RPC payload. No trial math anywhere else.
2. `src/hooks/useTenantSubscription.ts` — select `subscription_status, grace_ends_at`.
3. `src/components/TrialBanner.tsx` — three branches driven by `subscriptionStatus`:
   - `trial_active` → countdown copy.
   - `grace` → amber "Trial ended — X of 15 days remaining. Workspace running on Patio permissions." + `Upgrade` + `Finalize downgrade` (super-admin/tenant-admin only).
   - else → hidden.
4. `src/pages/admin/TenantManagement.tsx`:
   - Days column: `Grace Day X / 15` for grace; `Trial Day X / 30` for trial_active; existing account-lock logic preserved for `soft_locked`/`flagged_for_deletion`.
   - Rename `+15 days` → `+30 days`, wire to `fn_grant_extra_trial(id, 30, 'admin_extension')`.
   - Add `Finalize downgrade` action visible in `grace`, calls `fn_finalize_downgrade`.
5. `src/pages/admin/AdminDashboard.tsx`, `src/pages/Pricing.tsx`, `src/components/PricingTable.tsx` — read lifecycle from hook, drop local `isTrial(subscription_tier)` heuristics.
6. `src/integrations/supabase/types.ts` regenerated after migration approval.

---

## Step 7 — Documentation
Add `docs/subscription-lifecycle.md` co-committed with the migration:

- **States**: `trial_active`, `grace`, `active`, `downgraded`, `suspended` (reserved), `cancelled` (reserved).
- **Transition diagram** (ASCII):

```text
                 fn_init_provider_tenant
   (new tenant) ─────────────────────────► trial_active
                                              │  fn_expire_trials (pass A)
                                              ▼
                                            grace ─── fn_finalize_downgrade ──► downgraded
                                              │  fn_expire_trials (pass B, auto)   │
                                              │                                     │
                       fn_change_subscription_tier (upgrade)                        │
                                              ▼                                     │
                                            active ◄─── fn_change_subscription_tier
```

- **Invariants** (enforced by trigger from Step 2).
- **Reason vocabulary** (Step 5).
- **Extension points**: how to add `suspended` on payment_failure; how to plug Stripe webhook into `fn_change_subscription_tier` + new `fn_mark_payment_failure`.
- **Configuration**: `subscription_config` singleton controls grace/trial lengths.

Update `README.md` with a link to this doc; update project memory (`mem://features/tier-gating`) with the new lifecycle chokepoint.

---

## Step 8 — Verification
1. Manual DB tests via psql: insert an invalid combo (expect trigger reject); force-expire a test tenant; call `fn_finalize_downgrade` twice (idempotency); upgrade during grace (state cleared atomically).
2. Playwright smoke: super-admin sees `Grace Day X / 15` and can click **Finalize downgrade**; trial banner switches copy after status flip.
3. `supabase--linter` for new indexes/triggers.

---

## Not in scope (deliberately additive later)
Stripe webhooks, dunning emails, `suspended`/`cancelled` UI, per-tenant billing plans. Schema + audit shape + doc make these drop-in later.
