

## Plan: Restrict Providers from Client Routes & Ensure Provider Redirect

### Problem
1. Providers can access `/client` routes since there's no role guard on those routes.
2. The fallback redirect at `/` sends users to `/client` even when roles haven't loaded yet (line 110: the final fallback is `/client`).

### Changes

**`src/App.tsx`**

1. **Guard client routes**: Wrap the `/client` route group so that if `isProvider` is true, it redirects to `/provider` instead of rendering `ClientLayout`.
2. **Guard provider routes**: Wrap the `/provider` route group so that if `isClient` and not `isProvider`, it redirects to `/client`.
3. **Fix fallback redirect**: Change the final fallback on line 110 from `/client` to `/auth` (or show a "no role assigned" message) to avoid sending unassigned users to the client portal.

Specifically:
- Replace `<Route path="/client" element={<ClientLayout />}>` with a conditional: if `isProvider && !isClient`, render `<Navigate to="/provider" />` instead.
- Replace `<Route path="/provider" element={<ProviderLayout />}>` with a conditional: if `isClient && !isProvider`, render `<Navigate to="/client" />` instead.
- Change the default `/` fallback to redirect providers first, then clients, then show a loading/error state for users with no roles.

### No DB changes needed.

