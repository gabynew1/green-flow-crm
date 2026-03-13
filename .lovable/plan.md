

# Client Dashboard, Property CRUD & Contract View

## Overview
Transform the empty `/client` index page into a rich dashboard with upcoming visits, visit consumption stats, property management (add/edit/delete), and per-property contract + services view.

## 1. New Client Dashboard Page (`src/pages/client/ClientDashboard.tsx`)
Replace `ClientProperties` as the `/client` index route with a proper dashboard:

- **Top stats row**: Cards showing upcoming visits count, visit consumption (completed / total from active contracts), active properties count
- **Upcoming Visits section**: Next 5 scheduled visits with date, property name, status badge, linked to visit detail
- **My Properties section**: Grid of property cards (existing style) with link to property detail
- **"Add Property" button**: Top-right, opens a dialog/sheet to create a new property

Data queries:
- `properties` with customer join (filtered by `customer_id = get_user_customer_id`)
- `service_orders` for upcoming visits and consumption stats
- `contracts` for active contract count

## 2. Property CRUD for Clients

### Add Property Dialog
- Fields from existing schema: `name`, `address`, `city`, `description`, `geo_lat`, `geo_lng`
- On submit: insert into `properties` with the client's `customer_id` (from `profiles.customer_id`)
- Need new RLS policy: clients can INSERT properties where `customer_id = get_user_customer_id(auth.uid())`

### Edit Property
- On `ClientPropertyDetail` page, add an "Edit" button that opens a dialog with pre-filled fields
- On submit: update the property row
- Need new RLS policy: clients can UPDATE their own properties

### Delete Property
- On `ClientPropertyDetail`, add a "Delete" button with confirmation dialog
- Need new RLS policy: clients can DELETE their own properties

### DB Migration
- Add RLS policies for client INSERT, UPDATE, DELETE on `properties` table, all scoped to `customer_id = get_user_customer_id(auth.uid())`

## 3. Property Detail Enhancement (`src/pages/client/ClientPropertyDetail.tsx`)
Add to existing page:
- **Edit/Delete buttons** in header
- **Contracts section**: Query `contracts` by `property_id`, show contract name, status, date range
- **Services list per contract**: Query `contract_line_items` joined with `service_catalog` for each contract, display service name, quantity, frequency

## 4. Routing Update (`src/App.tsx`)
- Change `/client` index from `ClientProperties` to new `ClientDashboard`
- Add `/client/properties` route for the properties list page (optional, dashboard includes it)

## Files to Create/Edit

| File | Action |
|------|--------|
| `src/pages/client/ClientDashboard.tsx` | Create — dashboard with stats, upcoming visits, properties grid, add property button |
| `src/pages/client/ClientProperties.tsx` | Edit — add property dialog, keep as reusable or merge into dashboard |
| `src/pages/client/ClientPropertyDetail.tsx` | Edit — add edit/delete dialogs, contracts & services sections |
| `src/App.tsx` | Edit — change client index route to ClientDashboard |
| DB Migration | Add client INSERT/UPDATE/DELETE RLS policies on `properties` |

