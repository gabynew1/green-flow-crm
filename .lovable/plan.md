

## Plan: Delete All Old Services from Database

### What
Delete all service_catalog rows that don't belong to the 5 new categories. The user explicitly accepts breakage.

### Database Change
Use the data insert tool to run:
```sql
DELETE FROM service_catalog 
WHERE code NOT IN (
  'Design & Consulting', 
  'Garden Landscaping & Green Spaces', 
  'Regular Maintenance', 
  'Irrigation System Maintenance', 
  'Special & Seasonal Services'
);
```

This will remove ~42 old seed services. Any foreign key references from `offer_line_items`, `contract_line_items`, or `service_order_items` pointing to these IDs may break (show null service names). The user has accepted this.

### No code changes needed
The UI already reads from `service_catalog` — once the old rows are gone, the dropdowns will only show the correct 5 categories and correct units.

### Files to change
- **Data operation only**: DELETE old services

