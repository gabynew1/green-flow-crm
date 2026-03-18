

# Self-Service Onboarding from Landing Page

## Overview
Route all landing page CTAs to `/onboard`, a public version of the onboarding wizard. When accessed publicly (unauthenticated), the wizard skips the "Method" step and goes directly to "Enter Details". Rename "Manual Setup" to "Enter Details" everywhere.

## Changes

### 1. `src/App.tsx` — Add public `/onboard` route
- Add `<Route path="/onboard" element={<AdminOnboard />} />` inside the unauthenticated routes block (lines 69-74)

### 2. `src/pages/LandingPage.tsx` — Point CTAs to `/onboard`
- **`handleGetGrowing`** (line 181): Change navigate target from `/auth?email=...` to `/onboard?email=...&source=landing`
- **`handleStartFreeSubmit`** (line 195): Change navigate target from `/auth?email=...&tab=signup` to `/onboard?email=...&source=landing`
- **CTA Banner button** (around line 480): Navigate to `/onboard?source=landing` instead of opening the dialog or going to auth

### 3. `src/pages/admin/AdminOnboard.tsx` — Public mode + rename
- **Detect public mode**: Read `source` and `email` from `useSearchParams`. Set `isPublic = searchParams.get('source') === 'landing'` (also true when user is not authenticated — check via `useAuth` or just the param).
- **Pre-fill email**: If `email` param exists, populate `providerData.email` and `customerData.email` on mount.
- **Skip Method step**: When `isPublic` is true:
  - After type selection (step 1), auto-set `method = 'manual'` and jump to step 3 (details), skipping step 2 (method selection)
  - Update `STEP_LABELS` to `["Welcome", "Type", "Details", "Done"]` (4 steps instead of 5)
  - Adjust progress calculation accordingly
- **Back button on step 0**: When `isPublic`, navigate to `/` instead of `/admin/tenants`
- **"Enter Platform" button on celebration page (step 4)**: When `isPublic`, navigate to `/auth` instead of `/admin/tenants`
- **Rename**: Change `"Manual Setup"` to `"Enter Details"` in the method card title (line 541), and update its description to match

## Technical Details
- `AdminOnboard` already works as a standalone page (no AdminLayout wrapper needed for the `/onboard` route)
- The `goBack` function (line 270) navigates to `/admin/tenants` on step 0 — needs conditional for public mode
- Step numbering: In public mode, steps map as: 0=Welcome, 1=Type, 2=Details (was 3), 3=Done (was 4). The cleanest approach is to keep internal step numbers but skip step 2 automatically when transitioning from step 1 in public mode.
- The `handleTypeSelect` function (line 278) currently calls `goNext(2)` — in public mode, it should call `setMethod('manual')` then `goNext(3)` to skip the method step entirely.

