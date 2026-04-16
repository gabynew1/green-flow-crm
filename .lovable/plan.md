

## Plan: Complete Multi-Tenant Data Isolation

### Problem
Right now, most provider-facing RLS policies check only `is_provider(auth.uid())` without scoping to `tenant_id`. This means **any provider can see every other provider's customers, properties, contracts, visits, offers, and service catalog**. This is a critical data leak.

### Root Cause
1. **Missing `tenant_id` columns** on several tables (properties, contracts, service_orders, service_order_items, contract_line_items, offer_line_items, feedback, activity_log, tasks)
2. **RLS policies too broad** — use `is_provider()` without `tenant_id = get_user_tenant_id()`
3. **App queries missing tenant filter** — many pages query without `.eq("tenant_id", tenantId)`

### What Changes

#### Phase 1: Database Migration — Add `tenant_id` where missing

Add `tenant_id uuid` column to these tables (nullable initially, then backfilled from related data):
- `properties` (derive from `customers.tenant_id`)
- `contracts` (derive from `properties.tenant_id` after properties is fixed)
- `service_orders` (derive from `properties.tenant_id`)
- `contract_line_items` (derive from `contracts.tenant_id`)
- `offer_line_items` (derive from `offers.tenant_id`)
- `service_order_items` (derive from `service_orders.tenant_id`)
- `feedback` (derive from `service_orders.tenant_id`)
- `activity_log` (derive from `properties.tenant_id`)
- `tasks` (derive from related property/service_order)

Backfill existing rows using UPDATE + JOIN, then set columns to NOT NULL.

#### Phase 2: Database Migration — Fix RLS Policies

Replace all `is_provider(auth.uid())` provider policies with tenant-scoped versions:

```text
Table                 Current USING                          New USING
─────────────────────────────────────────────────────────────────────────
customers             is_provider() AND (tenant_id = ... OR NULL)   is_provider() AND tenant_id = get_user_tenant_id()
properties            is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
contracts             is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
service_orders        is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
service_order_items   is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
contract_line_items   is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
offer_line_items      is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
inspections           already scoped ✓
offers                already scoped ✓
service_catalog       already scoped ✓ (via RLS)
feedback              is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
activity_log          is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
tasks                 is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
inventory             is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
inventory_items       is_provider()                          is_provider() AND tenant_id = get_user_tenant_id()
```

#### Phase 3: App-Level Tenant Filtering

Update all provider page queries to include `.eq("tenant_id", tenantId)` as a defense-in-depth measure (RLS is the real guard, but app-level filtering prevents confusion):

- `Customers.tsx` — add tenant filter to customer + contract queries
- `ServiceCatalog.tsx` — add tenant filter  
- `Contracts.tsx` — add tenant filter
- `ServiceVisits.tsx` / `Dashboard.tsx` — add tenant filter to service_orders
- `CreateAdHocVisitDialog.tsx`, `CreateOpportunityDialog.tsx`, `CreatePipelineItemDialog.tsx` — add tenant filter to customer/property/catalog lookups
- All insert operations — ensure `tenant_id` is always set from `profile.tenant_id`

#### Phase 4: Ensure Catalog Isolation

The `service_catalog` RLS already filters by `tenant_id` on SELECT. However, the app query in `ServiceCatalog.tsx` doesn't filter — it shows all tenants' services. Add `.eq("tenant_id", tenantId)` to the load query and all catalog lookups.

### Technical Details

- Single large migration with backfill + column addition + RLS policy drops/recreates
- `inventory` and `inventory_items` also need `tenant_id` added (derive from `properties`)
- All INSERT statements across provider pages will be audited to include `tenant_id`
- The `useTenantQuery` hook's `TENANT_TABLES` set will be expanded to include all newly-scoped tables

### Risk
- Existing data without `tenant_id` needs careful backfill before NOT NULL is enforced
- If any tenant has properties linked to customers from another tenant, those will be orphaned (data integrity check first)

