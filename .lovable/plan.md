# Make the customer picker read as a search, not a dropdown

## Problem
The Create Visit customer field looks like a dropdown: the trigger says "Select customer",
the search box says "Search customers…" and the empty state says "Type to search…".
Users don't realise they must type before anything appears.

## Changes (copy only, in the customer picker)
1. Trigger label: "Select customer" becomes "Search customer".
2. Search input placeholder: "Please type name of customer, minimum 3 characters".
3. Empty hint (before enough characters are typed): same wording, shown as helper text
   so the requirement is visible inside the open panel.
4. Threshold: the picker currently starts searching at 2 characters. Raise it to 3 so
   the message matches actual behaviour.
5. Romanian translation kept in step with the English copy.

No behaviour, query, or data changes beyond the 2 -> 3 character threshold.

## Technical notes
- File: `src/components/pickers/CustomerCombobox.tsx`
  - default `placeholder` prop, `CommandInput` placeholder, the `debounced.trim().length < 2`
    guard in both the query `enabled` flag and the empty-state branch.
- `src/components/provider/CreateAdHocVisitDialog.tsx` passes no custom placeholder, so it
  inherits the new wording automatically.
