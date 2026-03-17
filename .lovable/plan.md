

## Plan: Provider Invite Link + Client Self-Service Connection

### Overview

Providers get a unique shareable Tenant ID (shown in Settings). They can generate an invite link containing that ID. Clients clicking the link (or manually entering the Tenant ID) can select which of their properties to connect to the provider. Already-connected properties are greyed out.

### 1. Database Changes

**Add `unique_tenant_id` to `tenants` table** — a short, human-readable code (like `GP-XXXXXX`) auto-generated via trigger:

```sql
ALTER TABLE tenants ADD COLUMN unique_tenant_id text UNIQUE;

-- Generate codes for existing tenants
CREATE OR REPLACE FUNCTION generate_unique_tenant_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  LOOP
    new_id := 'GP-';
    FOR i IN 1..6 LOOP
      new_id := new_id || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tenants WHERE unique_tenant_id = new_id);
  END LOOP;
  NEW.unique_tenant_id := new_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_unique_tenant_id
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION generate_unique_tenant_id();

-- Backfill existing tenants
UPDATE tenants SET unique_tenant_id = 'GP-' || substr(md5(id::text), 1, 6)
WHERE unique_tenant_id IS NULL;
```

**Add `tenant_id` to `properties` table** — tracks which provider tenant a property is connected to:

```sql
ALTER TABLE properties ADD COLUMN tenant_id uuid REFERENCES tenants(id);
```

### 2. Provider Settings — Show Tenant ID + Invite Link

In `src/pages/provider/Settings.tsx`, add a new **"Client Invite"** card under Company Information:

- Display the `unique_tenant_id` (fetched from tenants table) with a copy button
- Show a generated invite link: `{origin}/auth?connect={unique_tenant_id}`
- Copy link button to share with clients

### 3. Auth Page — Handle Invite Link

Modify `src/pages/Auth.tsx`:

- Parse `?connect=GP-XXXXXX` from URL query params
- If present, show a banner: "You've been invited by [Provider Name]. Sign up or log in to connect your properties."
- After successful login/signup, redirect to `/client/connect?provider=GP-XXXXXX`

### 4. New Client Page: Connect to Provider

Create `src/pages/client/ClientConnect.tsx`:

- Accessible via `/client/connect?provider=GP-XXXXXX` (from invite link) or from a "Connect to Provider" button on the client dashboard
- Flow:
  1. Look up the provider tenant by `unique_tenant_id` → show provider name
  2. Fetch client's properties
  3. For each property, check if `tenant_id` is already set (connected to any provider) → grey out with label "Already connected to [provider]"
  4. Client selects one, multiple, or all unconnected properties
  5. On confirm: update `properties.tenant_id` for selected properties + create `client_connections` record

- Also add a manual entry mode: input field for Tenant ID (so clients can connect without a link)

### 5. Client Dashboard — Add "Connect to Provider" Button

In `src/pages/client/ClientDashboard.tsx` or `ClientLayout.tsx`:

- Add a button/card: "Connect to a Provider" that opens a dialog or navigates to `/client/connect`
- Shows input for provider Tenant ID

### 6. Routing Changes

In `App.tsx`:
- Add route: `/client/connect` → `ClientConnect`

### 7. Files to Create/Edit

| File | Action |
|------|--------|
| DB migration | Add `unique_tenant_id` to tenants, `tenant_id` to properties |
| `src/pages/provider/Settings.tsx` | Add Tenant ID + invite link card |
| `src/pages/client/ClientConnect.tsx` | Create — property selection UI |
| `src/pages/Auth.tsx` | Handle `?connect=` query param |
| `src/App.tsx` | Add `/client/connect` route |
| `src/components/client/ClientLayout.tsx` | Add nav item or action for connecting |

