

## Plan: Clean Up Orphaned Data and Fix Insert Gaps

### Problem
After the tenant isolation migration, there are records with NULL `tenant_id` that are now invisible due to RLS. Since this is non-production, we can delete orphaned data and fix the code gaps that would create new orphaned records.

### Phase 1: Database Migration — Delete orphaned data and enforce NOT NULL

Delete all records with NULL `tenant_id` (cascading from children up to parents), then add NOT NULL constraints to prevent future orphans.

**Delete order** (children first):
1. `inventory_items` WHERE `tenant_id IS NULL` (1 row)
2. `inventory` WHERE `tenant_id IS NULL` (4 rows)
3. `service_order_items` WHERE `tenant_id IS NULL` (22 rows)
4. `service_orders` WHERE `tenant_id IS NULL` (7 rows)
5. `contract_line_items` WHERE `tenant_id IS NULL` (59 rows)
6. `contracts` WHERE `tenant_id IS NULL` (6 rows)
7. `properties` WHERE `tenant_id IS NULL` (4 rows)
8. `customers` WHERE `tenant_id IS NULL` (4 rows)

**Then add NOT NULL constraints** on `tenant_id` for: `customers`, `properties`, `contracts`, `service_orders`, `service_order_items`, `contract_line_items`, `inventory`, `inventory_items`.

**Update `handle_new_property` trigger** to copy `tenant_id` from the new property into the auto-created inventory record:
```sql
INSERT INTO public.inventory (property_id, tenant_id)
VALUES (NEW.id, NEW.tenant_id);
```

### Phase 2: Fix code insert gaps

**`CustomerDetail.tsx`** — Property insert missing `tenant_id`:
```typescript
// Add tenant_id to property insert
tenant_id: profile?.tenant_id,
```

**`InventoryTab.tsx`** — Inventory item insert missing `tenant_id`:
```typescript
// Derive tenant_id from the inventory record
tenant_id: inventory.tenant_id,
```

### Technical details
- Total orphaned rows to delete: ~103 across 8 tables
- All are test/fake data ("Fake Client 1", etc.)
- After NOT NULL enforcement, any future insert without `tenant_id` will fail loudly rather than silently creating invisible records

