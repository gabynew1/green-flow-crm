## Goals

1. When a provider approves a client link request (or a client approves the provider's), surface a fresh **Opportunity** card in the Sales Pipeline so the provider can begin contracting.
2. In the Tasks page right‑hand panel, show **Client name** and **Property name(s)** prominently for `link_request` tasks (currently only "From / Properties" rows; add explicit Client row + linked names).
3. Once the link is created (approved), the client name shown in the task panel must be a link that opens the matching customer in `/provider/customers/:customerId`.

## What changes

### A. Pipeline "Opportunities" feed (provider side)

Today the **Opportunities** tab on `/provider/sales-pipeline` renders `<Inspections embedded statusFilter="DRAFT" />` only. We will extend it so newly linked customers appear as actionable cards even before any inspection exists.

- New lightweight section above the inspections list inside the Opportunities tab: **"New connections"** card list.
  - Source: `client_connections` rows where `tenant_id = my tenant`, `status='APPROVED'`, and there is **no** offer/contract/inspection yet for any of the client's properties (joined via `profiles.customer_id` → `properties` → `offers/contracts/inspections`).
  - Each card shows: client name (from `profiles`/`customers`), property names, "Linked Xd ago", and two CTAs:
    - **Schedule inspection** → navigates to existing inspection-create flow pre‑filled with that customer/property.
    - **Create offer** → navigates to existing offer-create flow pre‑filled.
  - Dismissing a card simply means the provider creates an inspection/offer/contract — the card disappears automatically once any pipeline entity exists for the customer.
- No new DB table needed; this is a derived view in the React component.

### B. Tasks page — richer link_request details

In `src/pages/tasks/TasksPage.tsx` "Details" block, for `task_type === 'link_request'`:

- Add an explicit **Client** row showing the initiator's full name + email (already enriched via `profiles`).
- Add an explicit **Property** row (or list) using `property_ids` from payload with names + addresses (already enriched).
- Once the task is `approved`, render the Client name as a `<Link>` to `/provider/customers/:customerId`. We resolve `customerId` from the initiator's `profiles.customer_id` (fetch alongside the existing profile enrichment — add `customer_id` to the `select`). For a not‑yet‑approved task, show plain text.
- Property names also become links to `/provider/customers/:customerId` with a hash like `#property-<id>` (CustomerDetail already lists properties).

### C. Notifications (no schema change)

The existing approval flow already inserts a `user_notifications` entry and the link approval shares the customer record. We will simply add a follow‑up notification to the **provider tenant** on link approval — text: "New customer linked: <Client>. Start contracting." with a deep link to `/provider/sales-pipeline?tab=opportunities`. Implemented inside `_apply_task_side_effects` for `link_request` (small migration).

## Files to edit

- `src/pages/provider/SalesPipeline.tsx` — render new `<NewConnectionsBoard />` above Inspections in the Opportunities tab.
- New: `src/pages/provider/NewConnectionsBoard.tsx` — fetches connections + filters out customers that already have any inspection/offer/contract; renders cards with CTAs.
- `src/pages/tasks/TasksPage.tsx`:
  - Extend `useTaskEnrichment` profile select to include `customer_id`.
  - In the Details block, branch on `link_request` to render Client/Property rows; wrap names in `<Link>` when the task is `approved`.
- New migration `supabase/migrations/<ts>_link_approved_provider_notification.sql`:
  - In `_apply_task_side_effects`, after the `client_connections` upsert in the `link_request` branch, insert into `user_notifications` for each provider user in the tenant ("Customer linked, ready to contract") with deduped key `link-approved-<connection_id>`.

## Technical notes

```text
Opportunities tab
├── NewConnectionsBoard     ← NEW (cards: client + properties + CTAs)
└── Inspections embedded statusFilter="DRAFT"  (existing)
```

```sql
-- Inside _apply_task_side_effects, link_request approve branch (additive):
INSERT INTO public.user_notifications (user_id, tenant_id, title, body, entity_type, entity_id, ...)
SELECT p.user_id, t.tenant_id,
       'New customer linked',
       coalesce(initiator_name,'A client') || ' is now linked. Start contracting.',
       'client_connection', new_connection_id ...
FROM public.profiles p
WHERE p.tenant_id = t.tenant_id AND p.provider_permission IS NOT NULL
ON CONFLICT DO NOTHING;
```

Customer route already exists: `/provider/customers/:customerId` (`App.tsx`).

## Out of scope

- No changes to the link approval RPC's existing customer‑sharing logic (already fixed in the previous migration).
- No new task type; the Opportunity surface is purely UI derived from `client_connections` + pipeline tables.