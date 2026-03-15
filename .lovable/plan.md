

## Plan: Enhanced Contract Creation with Service Lines, Dates & Multi-Property

### Problem
Contract creation across entry points is missing mandatory service line selection, doesn't always require start/end dates, and the pipeline dialog only allows a single property.

### Entry Points to Update

**1. `src/pages/provider/Contracts.tsx`** (New Contract dialog)
- Already has: multi-property selection, start/end dates, visit frequency, billing
- **Add**: Mandatory service line selection step using the category-first pattern (same as visit dialog)
  - Fetch `service_catalog` on dialog open
  - Category dropdown → filtered checkboxes (all checked by default within chosen category)
  - Selected services summary with remove buttons
  - Services are required (at least one must be selected)
  - After contract(s) are created, insert `contract_line_items` for each selected service on each created contract

**2. `src/components/provider/CreatePipelineItemDialog.tsx`** (Pipeline Create menu, `type="contract"`)
- Currently: single property select, no dates, no services
- **Add for contract type only**:
  - Switch property selection from single `<Select>` to multi-checkbox (like Contracts.tsx), minimum 1 required
  - Add mandatory Start Date and End Date inputs
  - Add category-first service selection (same pattern)
  - Add visit frequency and billing cycle selects
  - Insert `contract_line_items` for each selected service after contract creation
  - Create one contract per selected property (same as Contracts.tsx behavior)

### Service Selection Pattern (reused in both)
- State: `selectedCategory`, `selectedServiceIds`, `services` (from catalog)
- Derive `categories` from unique `code` values
- Category dropdown filters visible checkboxes
- Selections persist across category switches
- Summary list shows all selected services with remove option
- Validation: at least 1 service required

### Contract Line Items Insert
After each contract is created, for every selected service:
```typescript
const lineItems = selectedServiceIds.map(serviceId => ({
  contract_id: newContractId,
  service_catalog_id: serviceId,
  quantity: 1,
  frequency_type: "PER_VISIT",
}));
await supabase.from("contract_line_items").insert(lineItems);
```

### Files
- **Edit**: `src/pages/provider/Contracts.tsx` — add service selection to New Contract dialog, insert line items after create
- **Edit**: `src/components/provider/CreatePipelineItemDialog.tsx` — for contract type: multi-property, dates, service selection, visit/billing frequency, insert line items

