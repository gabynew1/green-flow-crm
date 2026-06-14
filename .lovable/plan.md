## Goal

Let a client detach a property from a provider whenever no live or pending contract is in force on that property, so they can immediately reconnect it to a different provider. Today the only path is the provider deleting the link, which is why `gabriel@zealot.ro` is stuck linked even with no contract.

## Rule

A client may delink a property from its current provider when **no contract on that property** has status `ACTIVE` or `SENT_TO_CLIENT` (and is not archived). Contracts in `CLOSED` state, or no contracts at all, do not block.

Once delinked, the property's `tenant_id` is cleared. The property stays under the client (their `customer_id` is unchanged), so it shows up in `ClientConnect` as "available" and can be selected for a new provider.

## Backend

New SECURITY DEFINER RPC `public.client_delink_property(_property_id uuid)`:

1. Resolve `_caller_customer = get_user_customer_id(auth.uid())`. Reject if NULL.
2. Load the property. Reject if `customer_id <> _caller_customer` (not your property) or `tenant_id IS NULL` (already detached).
3. Block if any row exists in `contracts` where `property_id = _property_id AND archived = false AND status IN ('ACTIVE','SENT_TO_CLIENT')`. Return an error message naming the blocking contract count and state.
4. On success:
   - `UPDATE properties SET tenant_id = NULL WHERE id = _property_id`.
   - Cancel any future-dated `service_orders` on that property (`status = 'CANCELED'`, reason "Property delinked from provider by client").
   - Insert an `activity_log` row (`event_type='property_delinked'`, `related_entity_type='property'`).
   - Insert an `action_task` of type `info` (or reuse existing notification path) targeted at the provider's `PROVIDER_ADMIN`, so the provider sees the client left.
5. Return `{ ok: true, canceled_visits: <int> }`.

Grants: `GRANT EXECUTE ... TO authenticated`. The function itself enforces ownership, so RLS bypass is safe.

Existing accounts get this for free — no data migration required. The rule kicks in the next time the client opens their property.

## Frontend

### `src/pages/client/ClientPropertyDetail.tsx`
- Add a "Delink from provider" button in the header actions, visible only when `property.tenant_id` is set.
- Disable the button (with a tooltip explaining why) when any contract on the property is `ACTIVE` or `SENT_TO_CLIENT` and not archived — using the contract list this page already loads.
- Click opens an `AlertDialog` confirming: "{Provider name} will lose access to {Property name}. Any scheduled future visits will be canceled. Continue?" On confirm, call the RPC, toast the result (including canceled-visit count), and `load()` again.

### `src/pages/client/ClientProviders.tsx`
- On each provider card, add a small "Delink" icon button next to each shared property. Same enable/disable rule (we already have the property list per provider; extend the query to include a `has_blocking_contract` boolean by joining `contracts`).
- Same confirmation dialog, same RPC call, then `load()`.

### Copy
- Button label: "Delink from provider".
- Disabled tooltip: "Active or pending contract — close it first to delink".
- Success toast: "Property delinked. You can now connect it to another provider." (and "Canceled N upcoming visits" if applicable).

## What this does NOT change

- Provider-side delete/delink of customers and properties stays exactly as it is.
- The property's `customer_id`, inventory, history, and feedback remain intact — only the provider link is severed.
- No changes to RLS policies; the existing "Clients can update property tenant_id" policy already permits the underlying write, the new RPC just adds the contract guard and visit cleanup so the UI can rely on a single safe action.

## Files touched

- new migration: `client_delink_property` function + grant
- `src/pages/client/ClientPropertyDetail.tsx` — button, dialog, RPC call
- `src/pages/client/ClientProviders.tsx` — per-property delink action + extended query
