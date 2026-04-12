

## Plan: Password Management — Admin Reset, Forced Change, and Self-Service

### What it does

1. **Admin can reset passwords for team members**: In Settings > Team Management, each team member row gets a "Reset Password" button. Clicking it generates a new temporary password (stored in `profiles.temporary_password`) and updates the user's auth password via the existing `invite-team-member` pattern. Admin can also reset their own password this way.

2. **Force password change on first login with temporary password**: After successful login in `Auth.tsx`, check if `profiles.temporary_password` is not null. If set, redirect to a new `/change-password` page that forces the user to set a new password before proceeding. On successful change, clear `temporary_password` in profiles.

3. **Self-service password change from profile**: Add a "Change Password" card to `Settings.tsx` (for providers) and `ClientProfile.tsx` (for clients) with old password verification + new password fields. Uses `supabase.auth.signInWithPassword` to verify old password, then `supabase.auth.updateUser` to set new one.

### Technical details

**New edge function: `reset-user-password`**
- Accepts `{ target_user_id: string }`
- Validates caller is PROVIDER_ADMIN in same tenant as target (or same user)
- Generates random temporary password
- Updates auth user password via admin API
- Updates `profiles.temporary_password` with the temp password
- Returns `{ temporary_password: string }`

**New page: `src/pages/ChangePassword.tsx`**
- Shown when `temporary_password` is set on profile after login
- Two fields: new password + confirm
- Calls `supabase.auth.updateUser({ password })` then clears `temporary_password` in profiles
- Cannot be skipped — route guard in `App.tsx`

**Modified files:**

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/change-password` route; add guard that redirects to it when `profile.temporary_password` is set |
| `src/hooks/useAuth.tsx` | Expose `temporary_password` from profile data |
| `src/pages/ChangePassword.tsx` | New forced password change page |
| `src/pages/provider/Settings.tsx` | Add "Reset Password" button per team member; add "Change Your Password" card for self-service |
| `src/pages/client/ClientProfile.tsx` | Add "Change Password" card (old + new password) |
| `supabase/functions/reset-user-password/index.ts` | New edge function for admin password reset |

### UI flow

```text
Admin resets password:
  Settings → Team row → [Reset Password] → dialog shows new temp password

Forced change on login:
  Auth login → profile has temporary_password → redirect /change-password
  → user sets new password → temporary_password cleared → normal redirect

Self-service change:
  Settings/Profile → Change Password card
  → enter old password + new password → verified & updated
```

### Security
- Edge function validates caller is PROVIDER_ADMIN in same tenant
- Old password verified via `signInWithPassword` before allowing self-service change
- Password policy enforced (min 6 chars, 1 uppercase, 1 number)
- `temporary_password` cleared from profiles immediately after change

