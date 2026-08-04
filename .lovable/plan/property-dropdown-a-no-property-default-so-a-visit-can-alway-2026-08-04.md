# Property dropdown + a "no property" default so a visit can always be created

## Goal
Never let a missing property block a provider from scheduling, delivering, and invoicing an ad-hoc service. Two changes: make the property field a plain dropdown, and always offer a default entry so the provider can proceed without picking a real property.

## Part 1 — property becomes a real dropdown
- After a customer is selected, opening the field immediately lists that customer's `active` properties — no typing threshold. A search box shows only when the list is long.
- Without a customer scope (other pages using the picker unscoped), keep today's type-to-search so large tenants don't load everything.

## Part 2 — the "no property" default
The database requires every visit, activity log entry, and invoice to point at a property, and client-portal access rules are built on the property → customer link. Removing that link would ripple through visits, invoicing, activity history, and client visibility — high risk for no extra benefit.

Instead, each customer gets one automatic **"General / No specific location"** property:
- It appears as the first, pre-selected option in the property dropdown, labelled clearly as the general option.
- If the customer doesn't have one yet, it is created silently the moment the provider chooses it — no extra dialog, no setup step.
- It behaves like a normal property everywhere downstream (visit page, report, invoice, activity), so nothing else has to change.
- It is hidden from the customer's property list/count UI so it doesn't look like a real site, and it cannot be used as the target of a contract.

Net effect: the provider opens Create Visit, picks a customer, and can hit Create straight away — services and price are added on the visit page, and invoicing works exactly as it does today.

## Where this behaviour should be replicated
- Create Visit dialog (primary path) — dropdown + default option.
- Ad-hoc invoice / standalone billing flows that ask for a property — they resolve the same general property instead of blocking.
- Client visit requests and inspections keep requiring a real property (they are about a physical site), so they are left unchanged.

## Technical notes
- `src/components/pickers/PropertyCombobox.tsx`: customer-scoped mode fetches `properties` by `tenant_id` + `customer_id` + `status = 'active'`, ordered by name, no `ilike`, no min-character gate, enabled on open. Keep the hydration query and the cross-customer clear guard.
- Add a `general` flavour: a synthetic first item; on select, look up (or insert) the customer's general property via a `SECURITY DEFINER` RPC `fn_get_or_create_general_property(_customer_id uuid)` that enforces tenant ownership and returns the property id. Marked by a stable `unique_property_id` suffix (e.g. `__GENERAL`) so it can be detected and filtered.
- No schema change to `service_orders.property_id` (stays NOT NULL) and no RLS changes.
- Filter the general property out of `Customers`/`PropertyDetail` listings and the contract property picker.
- `CreateAdHocVisitDialog.tsx` only needs the new picker prop; its insert path is unchanged.
