# Auto-refresh provider lists via realtime

## Problem
After creating an opportunity, inspection, offer, contract, visit, or customer, the relevant list/board does not update until the user manually refreshes. The pages use plain `useEffect(() => { load(); }, [])` with no realtime subscription, and the affected tables are not part of the `supabase_realtime` publication (only `user_notifications` and `action_tasks` are).

## Solution
Two parts: (1) enable realtime on the relevant tables, (2) subscribe to changes in each list view and re-run its loader when something changes in that tenant.

### 1. Database migration — enable realtime
Add the following tables to `supabase_realtime` publication and set `REPLICA IDENTITY FULL` so updates carry full row payloads:

- `inspections` (covers Opportunities + Inspections columns)
- `offers`
- `contracts`
- `service_visits`
- `customers`
- `properties`
- `inventory_items` (so the "Inventory updated" chip on inspection cards refreshes live)

Guard with `IF NOT EXISTS`-style `DO $$` blocks to stay idempotent.

### 2. Reusable hook — `useRealtimeRefresh`
Create `src/hooks/useRealtimeRefresh.ts`:

```ts
useRealtimeRefresh(tables: string[], onChange: () => void, tenantId?: string)
```

- Opens one Supabase channel per mount with a unique name.
- Subscribes to `postgres_changes` (`event: '*'`) for each table, filtered by `tenant_id=eq.${tenantId}` when provided.
- Debounces `onChange` (~250 ms) so a multi-row insert (e.g. creating customer + property + inspection together) triggers a single reload.
- Cleans up via `supabase.removeChannel` on unmount.

### 3. Wire into list views
Call the hook right after the existing `load()` effect in each:

| File | Tables to watch |
|---|---|
| `src/components/provider/PipelineKanban.tsx` | `inspections`, `offers`, `contracts`, `inventory_items` |
| `src/pages/provider/Inspections.tsx` | `inspections` |
| `src/pages/provider/Offers.tsx` | `offers` |
| `src/pages/provider/Contracts.tsx` | `contracts` |
| `src/pages/provider/ServiceVisits.tsx` | `service_visits` |
| `src/pages/provider/Customers.tsx` | `customers`, `properties` |

Each call passes the tenant's id from `useAuth()` so the subscription is scoped (no cross-tenant noise) and aligns with the project's strict tenant isolation rule.

### 4. Optimistic UX touch (no extra round-trip needed)
The existing `load()` calls after create/update already refresh the originating page. The realtime layer is additive: it covers the case where a record is created from another page, dialog, or browser tab.

## Files

- create `supabase/migrations/<timestamp>_enable_realtime_pipeline.sql`
- create `src/hooks/useRealtimeRefresh.ts`
- edit `src/components/provider/PipelineKanban.tsx`
- edit `src/pages/provider/Inspections.tsx`
- edit `src/pages/provider/Offers.tsx`
- edit `src/pages/provider/Contracts.tsx`
- edit `src/pages/provider/ServiceVisits.tsx`
- edit `src/pages/provider/Customers.tsx`

## Out of scope
- Rewriting these pages to React Query (would be a larger refactor; the hook approach gives the same UX outcome with minimal change).
- Detail pages (offer/contract/inspection/visit detail) — they are loaded on demand and already refresh on user actions; can be added later if you want.
