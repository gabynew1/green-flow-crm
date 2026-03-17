

## Plan: Provider Profile & Team Management

### Database Changes

**1. Extend `profiles` table** — add company fields:
```sql
ALTER TABLE profiles ADD COLUMN company_name text;
ALTER TABLE profiles ADD COLUMN cui text;
ALTER TABLE profiles ADD COLUMN contact_email text;
ALTER TABLE profiles ADD COLUMN contact_phone text;
```

**2. Create `integrations` table** — placeholder for future Google integration:
```sql
CREATE TABLE integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  google_connected boolean NOT NULL DEFAULT false,
  google_email text,
  google_refresh_token text,
  google_access_token text,
  google_token_expires_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own integration" ON integrations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**3. Add `provider_role` enum and column to `user_roles`** for granular provider permissions:
- The existing `app_role` enum handles system-level roles (PROVIDER_ADMIN, PROVIDER_STAFF, CLIENT_USER).
- Add a new column `provider_permission` to `profiles` with values: `full_admin` (default for PROVIDER_ADMIN) or `field_staff` (limited: can create/update service orders & read/update inspections, read-only on everything else).

Actually, simpler approach: add a `provider_permission` text column to `profiles` (`'full_admin'` or `'field_staff'`). RLS already exists; the UI enforces feature gating.

```sql
ALTER TABLE profiles ADD COLUMN provider_permission text DEFAULT 'full_admin';
```

### Licensing Logic

The `tenants` table already has `max_provider_seats` (default 2) and `subscription_tier`. The "Add Team Member" flow will:
1. Count existing profiles with `tenant_id = current tenant`
2. If count >= `max_provider_seats`, show a message: "Seat limit reached. Upgrade your plan to add more team members."
3. Otherwise, allow inviting a new user (email + permission level)

### New Files

| File | Purpose |
|------|---------|
| `src/pages/provider/Settings.tsx` | Provider settings page with 3 sections |
| `src/pages/provider/TeamManagement.tsx` | Sub-page or section for team member list + invite |

### Settings Page Sections

**Company Information** (Card)
- Editable form: Company Name, CUI (Tax ID), Contact Email, Contact Phone
- Save updates `profiles` table for the current user

**Team Management** (Card)
- List all profiles where `tenant_id` matches current tenant
- Show: name, email, permission level (`full_admin` / `field_staff`), badge
- "Add Team Member" button → dialog with email, full name, permission select
  - Checks seat limit against `tenants.max_provider_seats`
  - Creates user via edge function (uses service role to create auth user + profile + role)
  - If over limit, shows upgrade prompt
- Ability to change permission level of existing members
- Current user cannot demote themselves

**Connected Services** (Card) — placeholder
- Google Card showing "Not Connected" with disabled "Connect Google Account" button
- Tooltip: "Coming soon"

### Edge Function: `invite-team-member`
- Accepts: email, full_name, permission, tenant_id
- Validates seat count < max_provider_seats
- Creates auth user with temporary password
- Creates profile with tenant_id and provider_permission
- Creates user_role with PROVIDER_STAFF (or PROVIDER_ADMIN if full_admin)
- Returns the temporary password for the admin to share

### Permission Gating (UI-level)
For `field_staff` users, disable/hide sidebar items they can't use:
- **Can access**: Service Visits (full CRUD), Inspections (read + update), Dashboard (read)
- **Cannot access**: Customers, Sales Pipeline, Service Catalog, Feedback, Settings/Team

Update `ProviderSidebar.tsx` to filter nav items based on `profile.provider_permission`.

### Routing Changes
- Add `/provider/settings` route in `App.tsx`
- Add "Settings" nav item (gear icon) in `ProviderSidebar.tsx` (visible only to `full_admin`)

### Files to Edit

| File | Change |
|------|--------|
| DB migration | Add columns + integrations table |
| `supabase/functions/invite-team-member/index.ts` | Create — team invite edge function |
| `src/pages/provider/Settings.tsx` | Create — company info + team + integrations |
| `src/App.tsx` | Add settings route |
| `src/components/provider/ProviderSidebar.tsx` | Add Settings nav, permission-based filtering |
| `src/hooks/useAuth.tsx` | Add `provider_permission` to ProfileData |

