## Custom Branded Password Reset

Replace Supabase's default password reset email with our own branded flow using existing Resend infrastructure.

### 1. Database (migration)

New table `password_reset_tokens`:
- `id` uuid PK
- `user_id` uuid (references auth user)
- `token_hash` text (SHA-256 of raw token)
- `expires_at` timestamptz (now + 1 hour)
- `used_at` timestamptz (nullable)
- `created_at` timestamptz
- `requested_ip` text (nullable, for audit)

RLS: deny all to authenticated/anon. Only service role accesses it (via edge functions).

Indexes: unique on `token_hash`, index on `user_id`.

### 2. Edge Functions

**`request-password-reset`** (public, no JWT)
- Input: `{ email: string }`
- Always returns 200 with generic message (prevent email enumeration)
- If user exists in `auth.users`: generate 32-byte random token, store SHA-256 hash, enqueue branded `RecoveryEmail` via existing `process-email-queue` infrastructure with reset link `https://greengrasscrm.ro/reset-password?token=<raw>`
- Rate limit: max 3 requests / email / hour (check token table)

**`confirm-password-reset`** (public, no JWT)
- Input: `{ token: string, new_password: string }`
- Validate password complexity (matches existing rules)
- Hash token, look up by `token_hash`, verify not used and not expired
- Use `supabase.auth.admin.updateUserById(user_id, { password })` 
- Mark token `used_at = now()`
- Invalidate any other unused tokens for that user
- Return success

### 3. Frontend

**`src/components/auth/AuthForgotStep.tsx`**: replace `supabase.auth.resetPasswordForEmail()` call with `supabase.functions.invoke('request-password-reset', { body: { email } })`. Keep existing UI/messaging.

**`src/pages/ResetPassword.tsx`**: 
- Detect `?token=` query param (custom flow) vs existing recovery session flow (legacy fallback)
- If token param present: call `confirm-password-reset` edge function
- If no token but recovery session exists: keep existing supabase.auth.updateUser path as fallback (so any in-flight legacy emails still work)

### 4. Email Template

Use the existing `RecoveryEmail` React-email template already in the codebase. No new template needed — just point our edge function at it via the existing email queue / `process-email-queue` dispatcher (Resend, sender `send.greengrasscrm.ro`).

### Out of scope

- No new email template
- No changes to login, signup, or other auth flows
- No removal of Supabase's built-in reset (it stays available but unused)
- No UI changes beyond the two files above

### Security notes

- Tokens stored only as SHA-256 hash (raw token never persisted)
- 1-hour TTL, single-use, revoked on password change
- Generic response on `request` prevents email enumeration
- All token operations server-side via service role
- Edge functions validate input with Zod
