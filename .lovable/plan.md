# Property field becomes a real dropdown

## Goal
Once a customer is selected in Create Visit, the Property field should behave like a plain dropdown listing that customer's active properties — no typing required.

## Behaviour
- Customer selected: open the field and immediately see the full list of that customer's `active` properties (no search threshold). A search box only appears when the list is long (more than 8 entries).
- Customer has no active properties: show "No active properties for this customer".
- Without a customer scope (other pages that use the picker with no `customerId`), keep today's type-to-search behaviour so large tenants don't load every property.

## Technical notes
- Edit `src/components/pickers/PropertyCombobox.tsx` only.
- When `customerId` is set: query properties filtered by `tenant_id`, `customer_id`, and `status = 'active'`, ordered by name, no `ilike` and no minimum-character gate; enabled as soon as the popover opens.
- Keep the existing hydration query and the defense-in-depth clear when the selected property does not belong to the current customer.
- Trigger label stays "Select property" in customer-scoped mode; the search-oriented copy remains only in the unscoped mode.
- No changes to `CreateAdHocVisitDialog.tsx` are required — it already passes the selected customer down.
