# Step A — Don't render the verify banner for already-confirmed users

## Problem

The "Verify your email" banner is being rendered even for users whose email is already confirmed (e.g. `sidor.gabriel@gmail.com`, confirmed since 2026-03-13). Root cause:

- `VerifyEmailBanner` reads `profile.email_verified` to decide whether to render.
- `useAuth.fetchProfile` does not select `email_verified` from the `profiles` table, so the value is always `undefined` on the client.
- `undefined` is falsy → the banner is constructed and rendered for every user, including confirmed ones.

The verification status itself is correct in the database (`profiles.email_verified = true`, `auth.users.email_confirmed_at` set, kept in sync by `trg_sync_email_verified_to_profile`). The client just isn't reading it.

## Fix — make verification state available, then short-circuit before render

The banner should never be constructed for a confirmed user. Two small changes:

1. **`src/hooks/useAuth.tsx`** — load the truth.
   - Add `email_verified: boolean` and `email_verified_at: string | null` to `ProfileData`.
   - Include both columns in `fetchProfile`'s `select(...)`.

2. **`src/components/provider/VerifyEmailBanner.tsx`** — don't render unless verification is actually missing.
   - Early-return `null` when any of these are true:
     - the profile or auth user hasn't loaded yet (`!profile || !user`),
     - `user.email_confirmed_at` is set (live auth truth, no cache lag),
     - `profile.email_verified === true` (mirror column).
   - Drop the `(profile as any)` cast.
   - Net effect: for verified users the component returns `null` before any banner JSX is built.

3. **`src/pages/Verify.tsx`** — same principle on the standalone verify page.
   - On mount, if `user.email_confirmed_at` is set, redirect immediately to `/provider` instead of showing the OTP form and a "Resend code" button that would silently no-op.

## What this does NOT touch

- No DB changes (sync trigger already correct).
- No email pipeline changes — Resend, queue, `process-email-queue`, `auth-email-hook`, all transactional flows untouched.
- Banner and verify page behavior for genuinely unconfirmed users is unchanged.

## Verification

- Logged in as `sidor.gabriel@gmail.com`: no verify banner anywhere in the provider workspace; visiting `/verify` directly redirects to `/provider`.
- Logged in as a brand-new unconfirmed test user: banner appears as before; `/verify` shows the OTP form as before.

## Next (queued, not in this change)

After Step A is applied, proceed to Step 2: wire the Supabase Auth Send Email Hook so unconfirmed users actually receive their confirmation email through the existing Resend pipeline (no new infra, just registers `auth-email-hook` and switches its signature verifier to Standard Webhooks).