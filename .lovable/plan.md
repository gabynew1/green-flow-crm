# Move "New Contract" to a full page

## Problem
Today, creating a contract happens inside a cramped `<Dialog>` on `/provider/contracts`. With property selection, multi-service selection, frequency, billing, and dates, it overflows and is hard to work with. Also, the current flow hard-blocks creation when a property has no inventory — the user wants a soft warning instead.

## Solution
Replace the dialog with a dedicated full-page route `/provider/contracts/new` that hosts the same form in a roomier two-column layout, and switch the inventory check from a hard error to a non-blocking warning.

## UX

```text
/provider/contracts/new
┌──────────────────────────────────────────────┐
│  ← Back to contracts                          │
│  New Contract                                 │
├──────────────────────────────────────────────┤
│ LEFT (2/3)                  RIGHT (1/3)       │
│  • Contract name             • Summary card   │
│  • Properties (search +        - # properties │
│     scrollable list, full      - # services   │
│     width)                     - frequency    │
│  • Inventory warning (if       - billing      │
│     any selected property      - inventory    │
│     has 0 items) — amber         status       │
│     banner with "Open          • Create       │
│     property" links              button       │
│  • Dates (start / end)         • Cancel link  │
│  • Services (category +                       │
│     items grid, full width)                   │
│  • Visit frequency                            │
│  • Billing cycle                              │
└──────────────────────────────────────────────┘
```

- Uses the project's emerald-on-light minimal aesthetic, rounded cards, no new colors.
- Sticky right-side summary on desktop; stacks on mobile.
- "Create Contract" stays disabled only for the existing hard requirements (name, ≥1 property, dates, ≥1 service). Missing inventory is a yellow warning, never a blocker.

## Changes

1. **New page `src/pages/provider/ContractNew.tsx`**
   - Lifts the form, state, and submit logic from the dialog in `Contracts.tsx`.
   - On success, `toast.success` and `navigate("/provider/contracts")` (or the new contract's detail page if a single one was created).
   - Inventory check rewritten: still queries `inventory` + `inventory_items` for the selected properties, but instead of `return`-ing, it stores the missing-property names in state and renders a warning panel. Submit proceeds regardless.

2. **Route in `src/App.tsx`**
   - Add `<Route path="contracts/new" element={<ContractNew />} />` next to the existing contracts routes.

3. **Update `src/pages/provider/Contracts.tsx`**
   - Replace the `<Dialog>` + trigger with a `<Link to="/provider/contracts/new">` styled as the existing "New Contract" button.
   - Remove the dialog's local state and `handleCreate` (moved to the new page); keep `load`, list rendering, filters, sort, CSV export untouched.

4. **Update `src/pages/provider/CustomerDetail.tsx`**
   - The "New Contract" button currently opens a local dialog (`setContractOpen`). Point it to `/provider/contracts/new?customerId={id}` so the page can pre-filter the property list to that customer. (The dialog component can stay for now; we just stop using it from this entry point — confirm by reading the file before editing.)

5. **Inventory warning copy**
   - "Heads up: {N} of the selected properties have no inventory yet — {names}. You can still create the contract; consider adding items so service planning has context." with an "Open property" link per name.

## Out of scope
- Editing an existing contract on a full page (that lives in `ContractDetail`).
- Changing the data model — no migration needed.

## Files
- create `src/pages/provider/ContractNew.tsx`
- edit `src/App.tsx` (add route)
- edit `src/pages/provider/Contracts.tsx` (replace dialog with link, drop now-unused state)
- edit `src/pages/provider/CustomerDetail.tsx` (route the button to the new page)
