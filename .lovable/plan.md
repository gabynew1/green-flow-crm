# Trial overhaul + Super Admin tier management

Keep the existing 4 tiers (Patio / Backyard / Estate / Territory) and current naming. Two parallel workstreams:

**A) Trial behaviour change** (30 days full access → soft-lock to Patio, one-per-identity).
**B) Tier entitlements become data, not code**, with a Super Admin UI to edit them.

---

## A. Trial behaviour

### A1. Trial length: 14 → 30 days
- `fn_init_provider_tenant` → `trial_expires_at = now() + interval '30 days'`.
- Backfill: every tenant where `subscription_tier='territory_trial'` AND `trial_expires_at > now()` → `trial_expires_at = created_at + interval '30 days'`. Already-expired tenants stay expired.

### A2. Expiry = soft-lock + downgrade to Patio (no data loss)
Hourly job in `lifecycle-cron` flips expired trials:
- `subscription_tier='patio'`, apply Patio entitlements from the new `plan_entitlements` table (see B).
- `feature_flags.trial_grace = { downgraded_at, prev_tier, over_limit_snapshot }`.
- **Nothing is deleted, archived, or hidden.** All existing teams/contracts/AI history remain readable and editable.
- New helper `useEntitlements()` compares live counts vs the tenant's tier caps and returns `{ canCreateTeam, canUseAI, blockedReasons[] }`.
- Create paths (TeamManager, AIAssistant entry, custom email templates, etc.) disable with tooltip: "Trial ended — upgrade to add more. Existing items stay active."

### A3. Naming/UI: keep current copy, minor tweaks
- Banner: "Your full-access trial ends in X days." Expired: "Trial ended — you're on free Patio. Data safe; upgrade to unlock teams + AI."

### A4. One trial per identity
New `trial_consumed_identities` table storing sha256 fingerprints of founding PROVIDER_ADMIN: email, CUI, VAT, normalized company_name, digits-only phone.
- On new tenant init: if any fingerprint matches → start directly on `patio` with `feature_flags.trial_denied_reason`. Else grant 30-day trial and insert all fingerprints.
- Backfill from existing tenants.
- Super admin override: `fn_grant_extra_trial(tenant_id)` resets to trial + logs to `super_admin_audit_logs`.

---

## B. Tier entitlements as data + Super Admin editor

Today, limits (max_teams, AI tier, seats) live partly in `src/lib/tiers.ts` and partly on each tenant row. That means changing "Estate gets 6 teams instead of 5" needs a deploy and a tenant backfill. Move all of it into one editable matrix.

### B1. New tables

```sql
plan_entitlements (
  tier text PRIMARY KEY,          -- 'patio'|'backyard'|'estate'|'territory'|'territory_trial'
  display_name text NOT NULL,
  sort_order int NOT NULL,
  price_monthly_eur numeric,
  notes text
)

entitlement_keys (
  key text PRIMARY KEY,           -- 'max_teams', 'max_clients', 'ai_tier', 'custom_email_templates', etc.
  label text NOT NULL,            -- human label shown in admin UI
  category text NOT NULL,         -- 'limits' | 'features' | 'integrations' | 'support'
  value_type text NOT NULL,       -- 'int' | 'bool' | 'enum'
  enum_values text[],             -- for value_type='enum' (e.g. ai_tier)
  unlimited_sentinel int,         -- e.g. 999 means "unlimited" for int keys
  description text,
  default_value jsonb NOT NULL    -- baseline when a new tier is created
)

plan_entitlement_values (
  tier text REFERENCES plan_entitlements(tier),
  key  text REFERENCES entitlement_keys(key),
  value jsonb NOT NULL,
  updated_at, updated_by,
  PRIMARY KEY (tier, key)
)
```

GRANTs: SELECT to authenticated (everyone needs to read their own tier's caps), ALL to service_role. Writes only via SECURITY DEFINER RPC `fn_set_entitlement(tier, key, value)` gated on `is_super_admin(auth.uid())`. All writes logged to `super_admin_audit_logs`.

### B2. Seed the initial matrix

Keys grouped by category, seeded to match today's behaviour:

| Category | Key | Patio | Backyard | Estate | Territory |
|---|---|---|---|---|---|
| limits | max_teams | 0 | 2 | 5 | 999 |
| limits | max_provider_seats | 1 | 4 | 10 | 999 |
| limits | max_active_clients | 10 | 50 | 250 | 999 |
| limits | max_properties | 25 | 150 | 750 | 999 |
| limits | max_active_contracts | 10 | 100 | 500 | 999 |
| features | ai_tier (enum) | none | standard | advanced | full |
| features | agentic_actions (bool) | false | false | true | true |
| features | custom_email_templates (bool) | false | false | true | true |
| features | branded_client_links (bool) | false | false | true | true |
| features | service_zones (bool) | true | true | true | true |
| integrations | einvoice_efactura (bool) | false | false | true | true |
| integrations | telegram_agent (bool) | false | false | false | true |
| integrations | google_calendar (bool) | false | true | true | true |
| support | priority_support (bool) | false | false | true | true |
| support | dedicated_success_manager (bool) | false | false | false | true |

(Numbers above match Step 1 of this plan — open to your tweaks in the admin UI later without a deploy.)

### B3. Resolver + hook

`fn_get_tenant_entitlements(tenant_id)` (SECURITY DEFINER, STABLE) joins tenant → tier → entitlement values and returns a single `jsonb`. Cached client-side via React Query under `['entitlements', tenant_id]`.

`useEntitlements()` exposes typed helpers:
```ts
const ent = useEntitlements();
ent.limit('max_teams')          // number, 999 = unlimited
ent.has('agentic_actions')      // boolean
ent.value('ai_tier')            // 'none'|'standard'|'advanced'|'full'
ent.canAddMore('max_teams', currentTeamCount) // { allowed, remaining, atCap }
```

Existing reads of `tenant.max_teams` / `tenant.ai_tier` are replaced by this hook. `src/lib/tiers.ts` becomes a presentational helper (icon, color, marketing copy) only — limits move out.

### B4. Super Admin UI

New page `src/pages/admin/PlanEntitlements.tsx` mounted at `/admin/plans`:

- Matrix table: rows = entitlement keys (grouped by category), columns = tiers. Cells are inline editable (int input, switch, enum select).
- "Apply unlimited" shortcut for int keys (writes the sentinel).
- Save = optimistic update, calls `fn_set_entitlement`, audit-logged.
- Filter by category. Search by key/label.
- "Add new entitlement key" dialog: label, category, value_type, default_value → inserts into `entitlement_keys` and seeds `plan_entitlement_values` for every tier with `default_value`. This is how future features get wired in.
- Per-tier pricing field editable inline (`plan_entitlements.price_monthly_eur`), which `PricingTable` reads.
- Read-only "Tenants on this tier" count per column for context.

Tenant-side: when a key flips, affected tenants pick it up on next React Query refetch (no migration needed, no redeploy).

### B5. New memory rule (Core)

Add to `mem://index.md` Core:
> Every new provider-facing feature MUST declare which tier(s) it ships to. Add an `entitlement_keys` row in the same migration that introduces the feature, gate the UI/RPC with `useEntitlements().has(...)` or a server-side check on `fn_get_tenant_entitlements`, and seed the matrix per tier before merging.

And a checklist memory at `mem://features/tier-gating`:
- Ask "what tier(s) get this?" before scoping.
- Migration: insert `entitlement_keys` row + default values per tier.
- Server: gate RPCs/edge functions via `fn_get_tenant_entitlements`.
- Client: gate UI via `useEntitlements()` — disable + tooltip + upgrade CTA, never hide silently.
- Update `PlanEntitlements` admin page label/category if needed (auto-renders from table).

---

## Files touched

```text
supabase/migrations/<new-trial>.sql
  - 30d trial + backfill
  - trial_consumed_identities + backfill + fingerprint helpers
  - fn_init_provider_tenant rewrite
  - fn_expire_trials, fn_grant_extra_trial

supabase/migrations/<new-entitlements>.sql
  - plan_entitlements, entitlement_keys, plan_entitlement_values (+ GRANTs + RLS)
  - seed full matrix matching today's behaviour
  - fn_get_tenant_entitlements (SECURITY DEFINER STABLE)
  - fn_set_entitlement (SECURITY DEFINER, super_admin only, audit-logged)

supabase/functions/lifecycle-cron/index.ts   (hourly fn_expire_trials call)

src/hooks/useEntitlements.ts                 (new)
src/lib/tiers.ts                             (strip limits, keep marketing/icons only)
src/components/TrialBanner.tsx               (copy + expired state)
src/components/provider/TeamManager.tsx      (useEntitlements gating)
src/pages/provider/AIAssistant.tsx           (paused-state card when ai_tier='none')
src/pages/admin/PlanEntitlements.tsx         (new admin matrix)
src/components/admin/AdminLayout.tsx         (sidebar link "Plans")
src/components/PricingTable.tsx              (read prices + feature lists from DB)
src/i18n/locales/{ro,en}/{public,provider,admin}.json
mem://index.md, mem://features/tier-gating   (new memory rule)
```

No payment integration, no tier renames, no destructive lock — only data moves from code to DB and the admin gets a single screen to govern entitlements without redeploys.
