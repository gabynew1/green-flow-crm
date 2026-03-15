

## Plan: Pre-select Customer & Property in Visit Dialog

### Changes

**Edit: `src/components/provider/CreateAdHocVisitDialog.tsx`**

1. Add optional props `defaultCustomerId?: string` and `defaultPropertyId?: string`
2. In the `loadData` callback, after data loads, apply defaults:
   - If `defaultCustomerId` is set, pre-select it
   - After properties load: if `defaultPropertyId` is set, use it; otherwise if the customer has exactly one property, auto-select it
3. Keep the customer/property dropdowns functional (user can still change them) but pre-filled

**Edit: `src/pages/provider/CustomerDetail.tsx`**

1. Pass `defaultCustomerId={id}` to `CreateAdHocVisitDialog`
2. If `props` array has exactly one item, also pass `defaultPropertyId={props[0].id}`

### Details

The dialog currently resets all fields on open via `resetForm()`. The enhancement will set defaults after `loadData` completes, checking if the passed customer ID exists in the loaded data before applying. This keeps the dialog reusable from other contexts where no defaults are passed.

