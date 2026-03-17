

## Plan: Customer Contract Improvements

### 1. Renew closed contracts (CustomerDetail.tsx)
Add a "Renew" button next to CLOSED contracts. On click, create a new contract with the same name (appended with year), same property, billing cycle, visit frequency — but new start/end dates (start = today, end = +1 year). Set status to ACTIVE automatically. Also copy over all line items from the old contract.

**Edit**: `src/pages/provider/CustomerDetail.tsx` — add Renew button in the contract row for `CLOSED` status, with a handler that duplicates the contract + line items and sets status ACTIVE.

### 2. Replace inline contract creation with pipeline dialog (CustomerDetail.tsx)
Remove the inline `handleCreateContract` form/dialog (lines 124-327). Instead, import and use `CreatePipelineItemDialog` with `type="contract"`, passing `defaultCustomerId={customerId}`. Add `defaultCustomerId` and `defaultPropertyId` props support to `CreatePipelineItemDialog`.

**Edit**: `src/components/provider/CreatePipelineItemDialog.tsx` — add optional `defaultCustomerId?: string` prop, apply it on load (same pattern as CreateAdHocVisitDialog).

**Edit**: `src/pages/provider/CustomerDetail.tsx` — replace the contract Dialog with `<CreatePipelineItemDialog type="contract" open={contractOpen} onOpenChange={setContractOpen} defaultCustomerId={customerId} />`. Remove unused state (`selectedPropertyIds`, `billingCycle`, `visitCount`, `visitType`, `handleCreateContract`, `toggleProperty`).

### 3. Add "Add All" button for services in ContractDetail.tsx
In the line items section header (next to "Add Line"), add an "Add All" button that inserts all active catalog services as line items in one batch (skipping any already added).

**Edit**: `src/pages/provider/ContractDetail.tsx` — add an "Add All" button next to "Add Line" that bulk-inserts all catalog services not yet in `lineItems`.

