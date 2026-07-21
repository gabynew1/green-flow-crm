## Async Combobox rollout — Global Users pivot + shared pickers

Two-phase plan. Phase 1 ships the Global Users pivot (the original request) *using* a new shared `TenantCombobox`. Phase 2 extracts the same pattern into `CustomerCombobox` + `PropertyCombobox` and pilots them in the ad-hoc visit dialog. Later surfaces migrate one PR at a time.

---

## Phase 1 — Global Users: Omnisearch + Async Tenant Combobox

### New filter bar in `src/pages/admin/GlobalUserManagement.tsx`

```text
[ 🔍 Search user name or email... ] [ 🏢 Tenant: Any ▾ ] [ Tier ▾ ] [ Status ▾ ] [ Clear ]
```

### State changes

Remove:
- `tenantFilter` state and its populated `<Select>`
- The `tenantOptions` derivation block (lines 89–95)

Add:
- `userSearchTerm` (rename of current `searchTerm`), debounced 250 ms
- `selectedTenantId: string | null` — drives the async combobox

Keep: `tierFilter`, `statusFilter`, `signupInfo*`, all action handlers.

### Users query

Refactor the existing `useQuery` (line 57):
- `queryKey: ["admin-global-users", debouncedUserSearch, selectedTenantId, tierFilter, statusFilter]`
- Compose server-side:
  - `debouncedUserSearch` → `.or("full_name.ilike.%term%,email.ilike.%term%")`
  - `selectedTenantId` → `.eq("tenant_id", selectedTenantId)`
- Tier + Status stay client-side (they filter on joined `tenants.subscription_tier` and `is_locked`; no regression).
- Keep `.limit(500)` and the "narrow your search" hint.

### `Clear`

Resets `userSearchTerm`, `selectedTenantId`, `tierFilter`, `statusFilter`.

### `TenantCombobox` (shared component built in this phase)

`src/components/pickers/TenantCombobox.tsx`, built from existing `Popover` + `Command` primitives, no new deps. Follows the shared spec below so `CustomerCombobox` and `PropertyCombobox` reuse the same shape.

---

## Phase 2 — Shared pickers + pilot in Ad-hoc Visit dialog

### New files

- `src/components/pickers/CustomerCombobox.tsx`
- `src/components/pickers/PropertyCombobox.tsx`
- (`TenantCombobox.tsx` already exists from Phase 1)

`src/components/pickers/` chosen over `ui/` because `ui/` is reserved for shadcn primitives.

### Shared spec (all three components)

**Controlled props:**
```ts
type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;   // default true
  disabled?: boolean;
};
```

**Query rules:**
- Debounce input 250 ms.
- Skip queries for terms < 2 chars — show "Type to search…".
- Search: `.ilike("name", %term%).order("name").limit(20)`.
- Tenant scoping via `useTenantQuery` for cache-key consistency (`TenantCombobox` is admin-only and skips this).
- Query keys:
  - `["picker-tenants", term]`
  - `["picker-customers", tenantId, term]`
  - `["picker-properties", tenantId, customerId ?? "all", term]`

**Initial hydration:** if the component mounts with `value` set but no cached label, run a single `.select("id, name").eq("id", value).maybeSingle()` so the trigger shows the real name, never a UUID.

**Popover states:** 0–1 char → "Type to search…"; loading → spinner row; 0 results → "No matches"; 20 rows → footer "Showing first 20 — refine your search".

**Trigger:** button showing resolved name or placeholder; `x` icon when `value && allowClear` calls `onChange(null)` without opening popover. `aria-expanded`, `aria-label` set.

### `PropertyCombobox` specifics

Extra prop: `customerId?: string`.

- With `customerId` → append `.eq("customer_id", customerId)`.
- Without → also select `customers ( full_name )` and render list rows as `<PropertyName> — <CustomerName>` to disambiguate.
- Defense-in-depth: in `useEffect([customerId])`, if `value` doesn't belong to the new `customerId`, call `onChange(null)` automatically.

### Pilot — `src/components/provider/CreateAdHocVisitDialog.tsx`

- Customer `<Select>` → `<CustomerCombobox value={selectedCustomerId} onChange={handleCustomerChange} allowClear={false} />`.
- Property `<Select>` → `<PropertyCombobox value={selectedPropertyId} onChange={setSelectedPropertyId} customerId={selectedCustomerId ?? undefined} allowClear={false} disabled={!selectedCustomerId} />`.
- `handleCustomerChange` sets the customer AND explicitly resets `selectedPropertyId = null`.
- Leave the service search untouched.

---

## Data continuity — nothing to migrate

Verified before writing this plan:
- **No DB schema changes** — pure UI refactor of already-existing tables (`tenants`, `customers`, `properties`, `profiles`). Backing rows and RLS unchanged.
- **No `localStorage` / `sessionStorage`** carries filter state anywhere in the app (grep confirmed).
- **No saved-views / user-preferences table** stores tenant/customer/property selections.
- **URL params** — the only persisted picker input is `Billing`'s `?customer=<uuid>` deep-link. The picker's "hydrate by id" step resolves that UUID to a name on mount, so existing bookmarked links keep working with zero user-visible mid-state.
- **Cache** — React Query keys are namespaced (`picker-*`, `admin-global-users`, …); old entries expire naturally on the next fetch. No manual `queryClient.clear()` needed.
- **In-flight sessions** — a user already sitting on `/admin/users` when the deploy lands loses their in-memory `tenantFilter` selection (Select was removed) and simply picks the tenant again in the new combobox. No data is lost.

If Phase 2 later migrates surfaces that DO persist filter state (none exist today, but future ones might), the migration checklist for that PR is: (a) confirm any stored id still resolves via hydrate-by-id, (b) fall back to `null` if the row is gone (soft-deleted, RLS-hidden), (c) toast once if a stored filter is dropped so the user understands why.

---

## Explicitly NOT in this plan

Migrate later, one PR each:
- `ServiceVisits` property filter
- `Billing` customer chip
- `ContractNew`, `OfferDetail`, `CreatePipelineItemDialog`, `CreateOpportunityDialog` customer/property pickers

Skip entirely (small fixed enums): Tier, Status, License, Role, Frequency, Currency, per-customer Zone, Non-workday reason, Email template.

---

## Verification

Phase 1:
- Type "Gabriel" with no tenant → matches across tenants.
- Pick tenant "Serene" then type "Gabriel" → users named Gabriel within Serene only.
- Tenant popover fires network requests only after ≥ 2 chars.
- Clear resets all four filters.

Phase 2:
- `/provider/visits` → New visit → customer search returns after 2 chars, property list appears only after a customer is chosen, swapping customer clears property.
- Preset `value` (dev override) shows the real name on first paint, never a UUID.
- No `select *` payloads > 20 rows for either picker in the network tab.

No schema, RPC, or route changes in either phase.
