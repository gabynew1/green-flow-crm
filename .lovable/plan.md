## Rename column + show days per status

**Column header**: `Trial Day` → `Days`

**Cell logic** (by status):
- `trial` → `Day X / 150` (existing `trialDayNumber` helper)
- `soft_locked` / `flagged_for_deletion` → `Day X / 180` (days since `locked_at`, 180-day purge window)
- `active` → `Day X / 30` monthly or `Day X / 365` yearly (days since last renewal / `created_at`, based on tier billing period)
- `suspended` / other → `—`

**Color**: red when `X >= total`, amber when within 15 days of total, else default.

**File touched**: `src/pages/admin/TenantManagement.tsx` only (header label + cell renderer). Add small helper `statusDayProgress(tenant)` inline returning `{day, total}`.

**Not in scope**: no schema changes, no other pages.
