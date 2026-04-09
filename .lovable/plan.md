

## Plan: Rename dialog to "Create Visit" with contract-aware service pre-selection

### What changes

**1. Rename the dialog**
- Title changes from "Create Ad-hoc Visit" to "Create Visit"
- Description updates accordingly

**2. After selecting Customer + Property, auto-detect active contracts**
- Query `contracts` table for the selected `property_id` where `status = 'ACTIVE'` (or `SIGNED`)
- If one or more active contracts exist, show a new **Source** selector with options:
  - Each active contract listed by name (e.g., "Annual Maintenance 2025")
  - "Ad-hoc" option (always available)
- If a contract exists, it is pre-selected by default
- If no contracts exist, default silently to "Ad-hoc" (no selector shown)

**3. Service pre-selection based on source**
- **Contract selected**: Fetch `contract_line_items` for that contract, resolve `service_catalog_id` values, and pre-select those services. The category-first picker is still shown but services from the contract are pre-checked. User can add/remove freely.
- **Ad-hoc selected**: No pre-selection; user picks services manually (current behavior)

**4. Persist the source on creation**
- When saving the service order, set `period_type` to `"CONTRACT"` and store a reference if a contract is selected, or keep `"ONE_TIME"` for ad-hoc
- Service order items get `source: "CONTRACT"` or `"AD_HOC"` accordingly
- Update `period_label` to reference the contract name when applicable

### Files to edit

| File | Change |
|------|--------|
| `src/components/provider/CreateAdHocVisitDialog.tsx` | Add contract lookup on property change, add Source selector, pre-select services from contract line items, update title/labels |

### Technical details

- New state: `contracts` (active contracts for selected property), `selectedSource` (`"ad_hoc"` or contract ID)
- On `selectedPropertyId` change: query `contracts` where `property_id = X` and `status IN ('ACTIVE','SIGNED')`, also join `contract_line_items` with `service_catalog_id`
- When source changes to a contract: set `selectedServiceIds` to the contract's line item service IDs
- When source changes to ad-hoc: clear `selectedServiceIds`
- On save: if contract source, set `period_type = "CONTRACT"`, `period_label = contractName + date`

