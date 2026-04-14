

## Plan: Fix Password Change Stuck Loop

### Root Cause
Race condition in `ChangePassword.tsx`:
1. `updateUser({ password })` fires → triggers `onAuthStateChange` → re-fetches profile (temporary_password still set)
2. THEN code clears `temporary_password` in DB
3. THEN `refreshProfile()` runs — but `onAuthStateChange` may fire again and overwrite state with stale data

The user stays trapped because the route guard in `App.tsx` keeps seeing `temporary_password` as truthy.

### Fix

**1. `src/pages/ChangePassword.tsx`** — Swap the order: clear `temporary_password` from the database FIRST, then update the auth password, then refresh profile. This ensures that when `onAuthStateChange` fires and re-fetches the profile, `temporary_password` is already null.

```
// New order:
1. Clear temporary_password in profiles table
2. refreshProfile() — so React state reflects the cleared value
3. updateUser({ password }) — now when onAuthStateChange re-fetches, it gets null
```

Also add `useNavigate` as a fallback to force redirect to `/` after success.

**2. Database fix** — Run a query to clear the stuck `temporary_password` for `office@serenegarden.ro` so the user is unblocked immediately.

### Files changed
- `src/pages/ChangePassword.tsx` — reorder operations, add navigate fallback

