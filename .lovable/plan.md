

## Plan: Add Service Visits Section to Customer Detail

### What
Add a "Service Visits" section to the customer detail page (matching the layout of Contracts and Properties sections), and move the "New Visit" button from the top header to sit next to the section heading.

### Changes

**Edit: `src/pages/provider/CustomerDetail.tsx`**

1. **Remove** the "New Visit" button from the top header area (lines 202-204)
2. **Add a "Service Visits" section** between Contracts and Properties, with:
   - Section header with "Service Visits" title + "New Visit" button (same pattern as Contracts/Properties headers)
   - Fetch `service_orders` for all properties belonging to this customer
   - Display visit cards showing period label, scheduled date, status badge — reusing the same display pattern from `PropertyVisitsTab`
   - Each card links to `/provider/visits/{id}`
3. **Add state**: `visits` array, loaded in the existing `load()` function by querying `service_orders` joined through the customer's properties

### Files
- **Edit**: `src/pages/provider/CustomerDetail.tsx`

