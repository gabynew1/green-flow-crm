## Goal
Make the Pricing page buttons actually change the tenant's plan (both directions) without admin involvement. No payment integration.

## Behavior
- Any authenticated PROVIDER_ADMIN can click a plan card → tenant's `subscription_tier` is updated immediately.
- PROVIDER_STAFF and CLIENT_USER see a disabled state with tooltip "Ask your admin to change the plan".
- Current plan button stays disabled ("Current plan").
- Trial users (`territory_trial`): choosing Territory or lower ends the trial and switches to the chosen paid tier; the Territory card still shows "Included in your trial" ribbon until they act.
- Downgrades allowed. Soft-lock/entitlement logic already trims excess teams — no data deleted.
- Confirmation dialog before switching (shows old tier → new tier, note about VAT/billing being manual for now, and downgrade warning if applicable).
- Toast on success; entitlements + tenant queries invalidated so UI reflects new tier immediately.

## Backend (one migration)
1. New RPC `public.fn_change_subscription_tier(p_tenant_id uuid, p_new_tier text)`:
   - `SECURITY DEFINER`, `search_path = public`.
   - Verifies caller is `PROVIDER_ADMIN` for `p_tenant_id` (via `user_roles` + `profiles.tenant_id`) OR super admin.
   - Validates `p_new_tier IN ('patio','backyard','estate','territory')` (no direct `territory_trial` assignment).
   - Updates `tenants.subscription_tier`, `max_teams`, `max_provider_seats`, `ai_tier` from the tier's canonical values (mirror `src/lib/tiers.ts`).
   - If leaving trial: clears `trial_expires_at`.
   - Logs to `activity_log` (`TIER_CHANGED`, old → new, actor user_id).
   - Returns updated row.
2. `GRANT EXECUTE ... TO authenticated`.

## Frontend
- `src/components/PricingTable.tsx`:
  - Replace `handleChoose` toast with mutation calling the RPC.
  - Add `AlertDialog` confirm step (shadcn `alert-dialog`).
  - Read `isProvider` + `PROVIDER_ADMIN` role from `useAuth`; disable buttons for non-admins with tooltip.
  - On success: `queryClient.invalidateQueries` for `["tenant-subscription"]` and `["entitlements"]`; success toast.
- `src/pages/Pricing.tsx`: no structural change (uses PricingTable).
- i18n: add strings for confirm dialog + non-admin tooltip in `public.json` (en + ro).

## Out of scope
- Real payments (Stripe/Paddle) — deferred; buttons note "billed manually by our team" in confirm dialog copy.
- Client-facing tier changes (clients don't have tenants).

## Technical details
- Tier → limits mapping lives both in `src/lib/tiers.ts` (UI) and in the RPC (SQL CASE). Keep values in sync; document in migration comment.
- Do NOT allow setting `territory_trial` via RPC — trial is only granted at signup by `fn_init_provider_tenant`.
- Existing `useEntitlements` refetches after invalidation → gated features unlock/lock automatically.
