

## Plan: Align Subscription Tiers — Remove "Starter", Add "Trial"

### Current state (misaligned)

| Source | Tiers |
|--------|-------|
| DB CHECK constraint | `free`, `starter`, `professional`, `enterprise` |
| DB column default | `trial` (not in constraint — fails on insert) |
| UI tier selector | `trial`, `free`, `pro`, `enterprise` |
| UI badge renderer | `enterprise`, `pro`, `trial`, default=Free |
| Edge function (create-manual-user) | `"free"` |

### Target tiers

| Tier | Purpose |
|------|---------|
| `free` | Default for admin-created provider accounts |
| `trial` | Default for self-signup; time-limited access to higher features |
| `professional` | Mid-tier paid plan |
| `enterprise` | Full features |

**"starter" is removed entirely. "pro" in UI is corrected to "professional".**

### Changes

**1. DB migration** — Drop old CHECK constraint, add new one with `free`, `trial`, `professional`, `enterprise`. Default stays `trial` (already set by a prior migration).

**2. `src/pages/admin/TenantManagement.tsx`**
- `getTierBadge`: replace `pro` → `professional` (blue badge), keep `enterprise`, `trial`, `free`
- Tier selector: update options to `trial`, `free`, `professional`, `enterprise`

**3. `src/pages/provider/Settings.tsx`** — If tier display exists, ensure it maps the same 4 values correctly.

**4. `supabase/functions/create-manual-user/index.ts`** — Already uses `"free"`, no change needed.

### Files to change

| File | Change |
|------|--------|
| DB migration | Replace CHECK constraint: `('free','trial','professional','enterprise')` |
| `src/pages/admin/TenantManagement.tsx` | Fix `getTierBadge` and tier selector to use correct 4 tiers |

