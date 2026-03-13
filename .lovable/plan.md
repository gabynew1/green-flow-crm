

# Multi-Tenancy, Default Client Role, Client ID & Provider-Client Onboarding

## Overview
Five interconnected changes: (1) super-admin invite-only provider onboarding, (2) multi-tenant data isolation, (3) default CLIENT_USER role on signup, (4) client profile zone with unique ID, (5) provider-client connection flow with approval.

---

## 1. Database Changes

### New table: `tenants`
- `id` (uuid, PK), `name` (text, default "New Tenant"), `created_by` (uuid), `created_at`, `updated_at`
- Each service provider belongs to a tenant

### New table: `provider_invites`
- `id` (uuid, PK), `token` (text, unique, generated), `tenant_id` (uuid, FK tenants), `created_by` (uuid), `role` (app_role, default PROVIDER_STAFF), `used_by` (uuid, nullable), `used_at` (timestamptz, nullable), `expires_at` (timestamptz), `created_at`
- Super admin (sidor.gabriel@gmail.com) creates invite links; when someone signs up via the link, they get assigned to that tenant with the specified role

### New table: `client_connections`
- `id` (uuid, PK), `tenant_id` (uuid, FK tenants), `client_user_id` (uuid, FK auth.users), `status` (enum: PENDING, APPROVED, DENIED), `requested_at`, `responded_at`, `provider_name` (text, for display to client)
- Represents a provider requesting to connect to a client

### Alter `profiles` table
- Add `unique_client_id` (text, unique) — auto-generated short readable ID (e.g. "GC-A7X3K2"), set via trigger on insert
- Add `tenant_id` (uuid, nullable, FK tenants) — set for provider users to scope their data

### Alter `customers` table
- Add `tenant_id` (uuid, FK tenants) — scopes customers to a tenant

### Alter `properties`, `contracts`, `service_orders`, `service_catalog`, `tasks`, `inventory`, `inventory_items`, `feedback`, `activity_log`, `contract_line_items`, `service_order_items`
- Data isolation flows through `customers.tenant_id` → properties → contracts/orders etc. No direct tenant_id needed on child tables since RLS already joins through parents. Only `service_catalog` needs a `tenant_id` (it's global per tenant).

### DB function: `generate_client_id()`
- Trigger on profiles insert: generates a unique short ID like "GC-" + 6 random alphanumeric chars, stores in `unique_client_id`

### DB function: `get_user_tenant_id(_user_id uuid)`
- Security definer function returning the tenant_id from profiles for a given user

### Update RLS policies
- Provider policies: add `AND tenant_id = get_user_tenant_id(auth.uid())` on `customers` and `service_catalog`
- Other tables inherit tenant scoping through their FK chains (properties → customers.tenant_id)
- `client_connections`: clients can SELECT/UPDATE their own rows; providers can SELECT/INSERT for their tenant
- `provider_invites`: only super admin can INSERT; anyone can SELECT by token (for signup validation)

### Default role on signup
- Modify `handle_new_user()` trigger: after inserting profile, also insert into `user_roles` with role = 'CLIENT_USER'
- This means every new signup is a client by default
- Provider invite flow overrides this: when signing up via invite link, replace CLIENT_USER with the invite's role and set tenant_id

### Super admin identification
- Use a DB function `is_super_admin(_user_id uuid)` that checks if the user's email = 'sidor.gabriel@gmail.com' (hardcoded for POC, or store in a `super_admins` table)

---

## 2. Provider Invite Flow (Super Admin Only)

### Edge function: `create-provider-invite`
- Only callable by super admin
- Creates a tenant (or accepts existing tenant_id) + generates a `provider_invites` row with a random token
- Returns a signup URL like `{origin}/auth?invite={token}`

### Auth page changes
- Detect `?invite=TOKEN` query param
- On signup with invite: after account creation, call an edge function `accept-provider-invite` that:
  - Validates the token (not expired, not used)
  - Sets the user's `tenant_id` on their profile
  - Replaces their CLIENT_USER role with the invite's role (PROVIDER_ADMIN or PROVIDER_STAFF)
  - Marks the invite as used

### Super Admin UI
- Add a simple `/admin` route (only visible to super admin)
- Page with: "Create Provider Invite" form (tenant name, role) → generates and displays the invite link

---

## 3. Client Profile Zone (Top-Left)

### Client Layout header update
- Replace the plain "GreenCRM" logo area with a profile zone showing:
  - Avatar icon (initials-based)
  - User's full name
  - Unique Client ID (e.g. "GC-A7X3K2") in a copyable badge
- Fetch from `profiles` table on mount

### Provider Sidebar update
- Show provider user name + tenant name below the GreenCRM logo

---

## 4. Provider-Client Connection Flow

### Provider side: "Onboard Client" page/dialog
- New nav item or button in Customers section: "Connect Client"
- Form: enter the client's unique ID (e.g. "GC-A7X3K2")
- On submit: look up the profile by `unique_client_id`, create a `client_connections` row with status=PENDING
- Show pending connections list

### Client side: Connection requests as tasks
- On the client dashboard/properties page, show a notification banner or card for pending `client_connections`
- Display: "{Provider/Tenant Name} wants to connect with you"
- Approve → sets `client_connections.status = APPROVED`, sets `profiles.customer_id` to a new or existing customer record under that tenant
- Deny → sets status = DENIED

### After approval
- The client's profile gets linked to a `customers` record under the provider's tenant
- Client can now see properties, visits, etc. scoped to that customer
- Provider sees the client in their Customers list

---

## 5. Files to Create/Edit

| File | Action |
|------|--------|
| Migration SQL | Create tenants, provider_invites, client_connections tables; alter profiles, customers, service_catalog; update triggers & RLS |
| `supabase/functions/create-provider-invite/index.ts` | Edge function for super admin |
| `supabase/functions/accept-provider-invite/index.ts` | Edge function for invite acceptance |
| `src/pages/Auth.tsx` | Handle `?invite=` param |
| `src/pages/admin/AdminInvites.tsx` | Super admin invite management page |
| `src/components/client/ClientLayout.tsx` | Add profile zone with unique ID |
| `src/components/provider/ProviderSidebar.tsx` | Show user/tenant info |
| `src/pages/provider/Customers.tsx` | Add "Connect Client" button/dialog |
| `src/components/client/ConnectionRequests.tsx` | Pending connection cards for clients |
| `src/hooks/useAuth.tsx` | Add profile data (unique_client_id, tenant_id, full_name) to context |
| `src/App.tsx` | Add admin route, update default redirect for users with no roles |

