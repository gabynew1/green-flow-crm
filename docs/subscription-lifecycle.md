# Subscription Lifecycle

## Concepts

- **Tier** (`tenants.subscription_tier`): commercial plan — `patio`, `backyard`, `estate`, `territory`, `territory_trial`.
- **Status** (`tenants.subscription_status`): lifecycle position — `trial_active`, `grace`, `active`, `downgraded`, `suspended`, `cancelled`.
- **Effective tier**: what entitlements resolve against. During `grace`, effective tier is forced to `patio`; otherwise it equals the stored tier. Computed centrally in `fn_get_tenant_entitlements`.

## State machine

```text
                 signup
                    │
           ┌────────┴────────┐
           ▼                 ▼
     trial_active          active           (paid / non-trial signup)
           │                 │
   trial_expires_at ≤ now    │
           ▼                 │
         grace  ──── admin/auto finalize ──►  downgraded
           │                                        ▲
   upgrade │                                        │
           ▼                                        │
         active  ◄── upgrade from any state ────────┘
```

Reserved future states: `suspended` (payment failure), `cancelled` (churn).

## Invariants (enforced by `trg_tenants_validate_lifecycle`)

- `trial_active` ⇒ tier = `territory_trial` AND `trial_expires_at IS NOT NULL`.
- `grace`        ⇒ tier = `territory_trial` AND `grace_ends_at IS NOT NULL`.
- `active`       ⇒ tier ≠ `territory_trial`.
- `downgraded`   ⇒ tier = `patio`.

## Configuration

`public.subscription_config` (singleton, id = 1):
- `grace_period_days` (default 15)
- `trial_length_days` (default 30)

## Chokepoints

| Transition                        | Function                                   |
| --------------------------------- | ------------------------------------------ |
| Signup grants trial               | `fn_init_provider_tenant`                  |
| Trial expires → grace / auto DG   | `fn_expire_trials` (cron, two-pass)        |
| Admin extends trial (+30d)        | `fn_grant_extra_trial(_, 30, reason)`      |
| Manual/auto finalize downgrade    | `fn_finalize_downgrade` (idempotent)       |
| Upgrade / paid tier change        | `fn_change_subscription_tier`              |
| Read effective entitlements       | `fn_get_tenant_entitlements`               |
| Log any transition                | `fn_log_subscription_transition`           |

Downgrade to Patio via `fn_change_subscription_tier` is intentionally routed through `fn_finalize_downgrade` so exactly one path performs the actual downgrade work.

## Audit

Every transition writes to `super_admin_audit_logs` with `from_status`, `to_status`, `from_tier`, `to_tier`, `actor` (nullable for cron), `reason`, plus structured `metadata` for extra context. Reasons in use today: `trial_started`, `trial_extended`, `trial_expired`, `manual_downgrade`, `automatic_downgrade`, `upgrade`. Future reasons (`payment_failed`, `cancelled`, `reactivated`) reuse the same helper.

## Frontend contract

- `useEntitlements()` exposes `tier`, `effectiveTier`, `subscriptionStatus`, `graceEndsAt`, `trialExpiresAt`, `inGrace`. Features must gate on entitlements, not on tier or status directly.
- `TrialBanner` branches on `subscription_status`, not on tier heuristics.
- Admin console shows grace day X/15 while status is `grace` and offers **Finalize Downgrade**; while status is `trial_active` it offers **+30 days**.