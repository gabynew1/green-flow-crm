## Goal

Improve the client→provider connection so that, on approval:

1. The **client** picks which properties to share (with Select all / Deselect all).
2. The **provider** automatically receives a fully-populated customer record — profile contact details, full property address, and the existing inventory for each shared property — ready to feed into inspections, offers and contracts.
3. A new **Providers** page (client sidebar) lists active providers and the properties they manage; the existing "Connect Provider" CTA moves under it.
4. **My Properties** shows an icon indicating whether each property is linked to a provider.

## What changes for the user

### Client portal
- Sidebar: new **Providers** entry (icon `Building2`) at `/client/providers`. The standalone "Connect Provider" link is removed and re-surfaced as a button inside this page.
- `/client/providers` shows:
  - One card per active linked provider with provider name, GP-ID, contact email, and an expandable list of every property currently shared.
  - A **Connect new provider** primary button (opens existing connect-by-ID flow).
  - A "Pending requests" section that lists in-flight `link_request` action tasks.
- Approving a provider link request (from Tasks page or dashboard banner) opens an **Approve dialog**:
  - Lists the client's properties with checkboxes, address preview, and an inventory-item count.
  - **Select all / Deselect all** toggle.
  - Already-linked properties are disabled with a "Linked to X" hint.
  - Approve button enabled only when ≥ 1 property selected. Reject still requires a comment.
- **My Properties** (and dashboard properties grid) shows a small badge on each card:
  - Linked → `Link2` icon + provider name.
  - Unlinked → outline `Unlink` icon + "Not linked".

### Provider portal (Serene Garden / Sebastian)
After the client approves with selected properties, the provider workspace will, with **no extra clicks**, contain:

- **Customer record** in `customers` (their tenant), with:
  - `name` and `contact_person_name` from the client's profile `full_name`
  - `email`, `phone` from profile
  - `company_name`, `billing_address` (composed from profile address fields), `cui`/`vat_id` notes when present (individual vs. company driven by `profiles.client_type`)
- **Properties** rows re-tagged to the provider's tenant — each carries the full address (`address`, `city`, geo coords if set) and `unique_property_id`.
- **Inventory** — the existing `inventory` row(s) and all `inventory_items` for each shared property are re-tagged to the provider's tenant so they are visible immediately on the property detail page (no copy/duplication, the same rows now belong to the provider's tenant per RLS).
- **Sales Pipeline** — the new customer appears in the Leads/DRAFT column automatically (existing pipeline reads `customers` filtered by tenant), so Sebastian can start an inspection → offer → contract using the inherited address + inventory.
- A "Customer connected — N properties shared" notification + activity-log entry is emitted to all provider admins, listing the property names so it is obvious what was just received.

## Technical changes

### Database (single migration)

1. **Replace `_apply_task_side_effects(_task_id, _action)`** for `task_type = 'link_request'`:
   - Identify `v_client_user` and `v_tenant` regardless of who initiated (provider→client or client→provider).
   - Read `v_props uuid[] := payload->'property_ids'`. If empty, no property is moved.
   - Compute `v_client_customer := profiles.customer_id` for the client.
   - **Upsert provider-side customer** in `v_tenant`:
     - Match on `lower(email) = lower(profile.email) AND tenant_id = v_tenant`.
     - If missing, INSERT with: `name = profile.full_name`, `contact_person_name = profile.full_name`, `email`, `phone`, `company_name = profile.company_name`, `billing_address = concat_ws(', ', address_street||' '||address_number, address_city, address_county)`, `notes` capturing CUI/VAT/CNP for compliance, `status = 'ACTIVE'`.
     - Capture `v_provider_customer`.
   - **Re-tag selected properties** that belong to the client's customer:
     - `UPDATE properties SET tenant_id = v_tenant, customer_id = v_provider_customer WHERE id = ANY(v_props) AND customer_id = v_client_customer`.
   - **Re-tag inventory & items** for the moved properties:
     - `UPDATE inventory SET tenant_id = v_tenant WHERE property_id = ANY(v_props)`.
     - `UPDATE inventory_items SET tenant_id = v_tenant WHERE inventory_id IN (SELECT id FROM inventory WHERE property_id = ANY(v_props))`.
   - **Activity-log entry** per moved property: event_type = `customer_linked`, description includes provider name and property name.
   - Insert/refresh `client_connections` (status APPROVED, responded_at = now()).
   - Emit notifications: `connection_approved` to client; `customer_connected` (reuse `connection_approved`) to all provider admins, body lists the N property names.
   - Reject path unchanged.

2. **Extend `act_on_task(_task_id, _action, _comment, _payload_patch jsonb DEFAULT '{}')`**:
   - Before applying side effects, `UPDATE action_tasks SET payload = payload || _payload_patch WHERE id = _task_id` so the client can pass `{ "property_ids": [...] }` at approval time without a new RPC.
   - Backwards compatible: existing callers that omit the new arg keep working.

3. **One-shot backfill (DO block in same migration)** for the existing Serene Garden ↔ Sonia approved connection:
   - For every property currently owned by Sonia's customer whose `tenant_id` is NULL or already Serene Garden's tenant, run the same upsert + re-tag + inventory move so Sebastian sees the customer/properties/inventory immediately.

4. **Index**: `CREATE INDEX IF NOT EXISTS idx_properties_customer_tenant ON public.properties (customer_id, tenant_id)`.

No RLS changes required — clients already have UPDATE on their own properties; providers already manage their tenant's `customers`, `properties`, `inventory`, `inventory_items`.

### Frontend

- **`src/components/client/ClientLayout.tsx`** — replace "Connect Provider" sidebar item with **Providers** → `/client/providers` (icon `Building2`).
- **New `src/pages/client/ClientProviders.tsx`**
  - Loads `client_connections` (status APPROVED) for `auth.uid()`, joins `tenants(name, unique_tenant_id)`, and `properties` filtered by `tenant_id = connection.tenant_id AND customer_id IN (client's customer ids)`.
  - Per-provider card: name, GP-ID, contact email; expandable property list with name + address.
  - Header **Connect new provider** → opens existing `ClientConnect` (modal or route).
  - "Pending requests" section reads `action_tasks` (`task_type='link_request'`, status `pending`).
- **New `src/components/client/ApproveLinkDialog.tsx`**
  - Props: `taskId`, `tenantName`, `onDone`.
  - Loads client properties with `tenant_id`, joined `tenants(name)` for the linked badge, plus `inventory_items` count per property for transparency ("12 items will be shared").
  - Checkboxes, Select all / Deselect all, disabled rows for already-linked properties.
  - Approve calls `actOnTask(taskId, 'approve', null, { property_ids: [...] })`.
- **`src/hooks/useActionTasks.ts`** — extend `actOnTask` signature with optional `payloadPatch` forwarded as the new RPC arg.
- **`src/pages/tasks/TasksPage.tsx`** — for `task_type='link_request'` where the current user is the target, the Approve button opens `ApproveLinkDialog` instead of acting directly.
- **`src/components/client/ConnectionRequests.tsx`** — same change: route Approve through the dialog; remove direct `client_connections` writes.
- **`src/pages/client/ClientProperties.tsx` and dashboard properties grid (`ClientDashboard.tsx`)**
  - Select `tenants(name)` along with each property; render a small badge:
    - Linked → `<Badge variant="secondary"><Link2/> {tenantName}</Badge>`
    - Unlinked → `<Badge variant="outline" className="text-muted-foreground"><Unlink/> Not linked</Badge>`
- **`src/App.tsx`** — register the `/client/providers` route.

### How the provider sees the new customer
No new provider-side code is needed. Existing screens read by tenant:

- `Customers.tsx` lists `customers` for the active tenant → new row appears.
- `SalesPipeline.tsx` shows DRAFT customers by tenant → ditto.
- Property detail (`PropertyDetail.tsx`) reads `properties` + `inventory` + `inventory_items` by tenant → address & inventory are already populated, so Sebastian can immediately create an inspection / offer / contract.

### Out of scope
- Per-property revoke flow from the new Providers page (placeholder "Manage access" link only).
- Multi-tenant `profiles.customer_id` (kept single-tenant; cross-tenant linkage continues via `properties.tenant_id` and tenant-scoped customer rows).
- Copying historical visits/contracts from the client side (none exist client-side anyway).

### Files touched
- DB: 1 new migration (`_apply_task_side_effects` rewrite, `act_on_task` extension, backfill DO block, index).
- New: `src/pages/client/ClientProviders.tsx`, `src/components/client/ApproveLinkDialog.tsx`.
- Edited: `src/App.tsx`, `src/components/client/ClientLayout.tsx`, `src/components/client/ConnectionRequests.tsx`, `src/pages/tasks/TasksPage.tsx`, `src/hooks/useActionTasks.ts`, `src/pages/client/ClientProperties.tsx`, `src/pages/client/ClientDashboard.tsx`.
