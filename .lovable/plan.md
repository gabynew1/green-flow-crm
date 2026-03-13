

# Client Profile Page

## What We're Building

A dedicated **My Profile** page for clients where they can view and edit their personal information (full name, phone, email) with data persisted to the `profiles` table.

## Current State

- The `profiles` table already has `full_name`, `phone`, `email` columns — no DB changes needed.
- Profile data is already fetched in `useAuth` but only `full_name`, `unique_client_id`, `tenant_id`, `email`, `customer_id`.
- No dedicated profile page exists; the header just shows name + client ID.

## Changes

### 1. Update `useAuth` to include `phone`
Add `phone` to the `ProfileData` interface and the `fetchProfile` select query so it's available app-wide.

### 2. Create `src/pages/client/ClientProfile.tsx`
A profile page with:
- Display card showing full name, email, phone, and Unique Client Number (read-only)
- Edit mode toggled by an "Edit" button
- Editable fields: full name, phone (email shown read-only since it's tied to auth)
- Save updates to the `profiles` table, then refresh the auth context profile
- Success/error toasts

### 3. Add route and nav item
- Add `/client/profile` route in `App.tsx` under the client layout
- Add a "My Profile" nav item (User icon) to `ClientLayout.tsx` nav
- Alternatively, make the avatar/name in the header clickable to navigate to the profile page

### Files to Change

| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Add `phone` to ProfileData and select |
| `src/pages/client/ClientProfile.tsx` | New profile page |
| `src/App.tsx` | Add `/client/profile` route |
| `src/components/client/ClientLayout.tsx` | Add profile nav link |

