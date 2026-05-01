## Plan: Subscription System with Property-Themed Tiers

Reuses existing `tenants` table (`subscription_tier`, `trial_expires_at`, `max_provider_seats`), super-admin layer, and `AIChatBox`/`TeamManager` components.

---

### 1. Database (migration)

**Extend tier enum & defaults**
- Replace `subscription_tier` text values with: `patio` | `backyard` | `estate` | `territory` | `territory_trial` (text, no enum to keep flexible).
- Default new tenants → `territory_trial`, `trial_expires_at = now() + 90 days`.
- Add `tenants.max_teams int NOT NULL DEFAULT 0` (0=solo, 2, 5, 999=unlimited).
- Add `tenants.ai_tier text` ('none'|'standard'|'advanced'|'full').
- Add `profiles.vat_id text` already exists (`vat_id`) — reuse.

**Trial extension audit**
- Add table `trial_extensions(id, tenant_id, extended_by, days int default 15, created_at)`. RLS: super_admins only.

**Tier config helper function**
- `apply_tier_limits(tenant_id, tier)` SECURITY DEFINER → updates `max_teams`, `max_provider_seats`, `ai_tier` based on tier mapping:
  - patio: max_teams=0, seats=1, ai=none
  - backyard: max_teams=2, seats=4, ai=standard
  - estate: max_teams=5, seats=10, ai=advanced
  - territory / territory_trial: max_teams=999, seats=999, ai=full

**Trial expiry job (scheduled)**
- pg_cron daily: any tenant where `subscription_tier='territory_trial' AND trial_expires_at < now()` → set tier to `patio`, apply limits. Existing teams kept (data preserved); enforcement happens in app.

**Trigger**: on new tenant insert → set 90-day trial + apply territory limits.

---

### 2. Frontend

**`src/lib/tiers.ts`** (new)
- Export `TIERS` config: id, name, price EUR, vatNote, maxTeams, aiTier, features[], color.
- Helpers: `getTierConfig(tier)`, `isTrialActive(tenant)`, `daysLeftInTrial(tenant)`, `canCreateTeam(tenant, currentTeamCount)`.

**`src/components/PricingTable.tsx`** (new)
- 4-column responsive card grid, earth-tone palette (forest greens `#2d5a3d`, slate `#475569`, cream `#faf7f0`).
- Highlight Territory with "Included in your trial" ribbon when user is on trial.
- "Choose plan" CTA → opens contact/upgrade dialog (no payment integration in scope; logs intent).

**`src/components/TrialBanner.tsx`** (new)
- Top banner inside `ProviderLayout`. Shows when `subscription_tier='territory_trial'`: "Your Territory Trial ends in X days. [View plans]".
- Red variant when ≤7 days. Hidden when not on trial.

**`src/pages/Pricing.tsx`** (new) + route `/pricing`
- Renders landing nav + PricingTable + FAQ. Public route.

**AI gating — `src/components/AIChatBox.tsx`**
- Read tenant tier via existing tenant query.
- If `ai_tier='none'` (Patio): render blurred preview overlay with "Upgrade to unlock AI assistant" CTA → links to `/pricing`.
- Pass `aiTier` to backend so `ai-assistant` edge function can scope capabilities (standard=task only, advanced=+scheduling, full=+insights). System prompt switches based on tier.

**Team enforcement — `src/components/provider/TeamManager.tsx`**
- Fetch `tenant.max_teams` and current team count.
- Disable "Create Team" button when at limit; tooltip "Upgrade to add more teams".
- Show banner if `teamCount > max_teams` (post-downgrade): "X teams over your Backyard limit. Excess teams are read-only until you upgrade or remove them."
- Mark over-limit teams (sorted by created_at desc, the newest above limit) with locked badge; disable assignment/edit.

**Admin dashboard — `src/pages/admin/TenantManagement.tsx`**
- Add columns: "Trial Day" (e.g. `Day 45 / 90` computed from `created_at` and `trial_expires_at`), "Teams" (live count from `teams` table).
- Replace generic "Extend Trial" with **"+15 days"** button — single click, calls RPC `extend_trial_15(tenant_id)` which:
  - Verifies caller is super_admin
  - `trial_expires_at = trial_expires_at + 15 days`
  - Inserts row in `trial_extensions`
  - Logs via `log_super_admin_action`
- Update tier change dropdown to new 4 tiers; on change calls `apply_tier_limits`.

**VAT ID collection**
- Add `vat_id` field to provider onboarding/billing settings form (`src/pages/provider/Settings.tsx`). Optional, format hint "RO12345678 / EU VAT".

---

### 3. Styling

Add CSS variables to `src/index.css` for earth-toned palette used only in pricing/trial UI (forest `--forest: 142 35% 26%`, slate, cream). Existing emerald accent stays for the rest of the app.

---

### Technical notes

- Prices displayed as `€5 / mo + VAT` (string in tier config). No payment processing in this scope — "Choose plan" creates an upgrade request record (`upgrade_requests` table optional, or just toast + email). **Recommendation: log to `super_admin_audit_logs` and toast "Our team will contact you" — keeps scope tight.** Confirm if you want Stripe wired now.
- Trial freeze logic: the cron downgrades tier; client-side enforcement (team creation, AI access) reads tier and blocks. No data deletion.
- Excess-teams logic is purely visual/UX — RLS still allows reads; we wrap mutations behind `canMutateTeam(team)` guard.
- 15-day extension is fixed (not configurable input), per spec "exactly 15 days per click".

### Files touched

- Migration: tier defaults, `max_teams`, `ai_tier`, `trial_extensions` table, `apply_tier_limits` & `extend_trial_15` RPCs, pg_cron job
- `src/lib/tiers.ts` (new)
- `src/components/PricingTable.tsx` (new)
- `src/components/TrialBanner.tsx` (new)
- `src/pages/Pricing.tsx` (new) + route in `src/App.tsx`
- `src/components/AIChatBox.tsx` (gate)
- `src/components/provider/TeamManager.tsx` (limits)
- `src/components/provider/ProviderLayout.tsx` (mount banner)
- `src/pages/admin/TenantManagement.tsx` (Day X/90, +15 button, new tiers)
- `src/pages/provider/Settings.tsx` (VAT ID field)
- `supabase/functions/ai-assistant/index.ts` (tier-aware prompt)
