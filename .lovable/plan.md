

# Landscaping CRM — Implementation Plan

## Overview
A modern, AI-enabled CRM for a landscaping services provider with two portals: a **Provider Workspace** (full management) and a **Client Portal** (review & feedback). Built on Lovable Cloud with Supabase for auth, database, and edge functions.

---

## Phase 1: Foundation & Data Model

### Database Schema
Create all tables with proper relationships and RLS:
- **customers** — name, contact info, billing address, notes
- **properties** — linked to customer, with address, geo_location, status
- **inventory** & **inventory_items** — per-property green inventory with category enum (TREE, LAWN, SHRUB, FLOWER_BED, OTHER) and source tracking (MANUAL, AI_ASSISTED)
- **service_catalog** — global library of landscaping services, pre-seeded with 10 standard items
- **contracts** & **contract_line_items** — per-property contracts with billing cycle, status, and linked services
- **service_orders** & **service_order_items** — visit/session logging with period tracking and completion status
- **feedback** — star ratings and comments per service order
- **user_roles** table (separate from profiles) with roles: PROVIDER_ADMIN, PROVIDER_STAFF, CLIENT_USER
- **profiles** — linked to auth.users, with customer_id for client users
- **tasks** — lightweight tasks linked to property or service order
- **activity_log** — timeline entries for properties

### Auth & Security
- Lovable Cloud auth with email sign-in
- RLS policies using a `has_role()` security definer function
- Provider users: full access to all data
- Client users: restricted to their own customer's properties and related data

### Seed Data
- 1 provider admin user
- 3 example customers with 1-3 properties each, inventory items, contracts, service orders, and feedback

---

## Phase 2: Provider Workspace

### Layout
- Persistent left sidebar with navigation: Dashboard, Customers & Properties, Contracts, Service Visits, Service Catalog, Feedback
- Collapsible sidebar with icons in mini mode
- SidebarTrigger always visible in header

### Provider Dashboard
- KPI cards: active customers, active contracts, sessions this week/month, average rating
- "Upcoming service visits" list (scheduled this week)
- "Pending client reviews" list (sent but not approved)
- "Recent feedback" with ratings
- "Upcoming tasks" widget

### Customers & Properties
- Searchable/filterable customer list
- Customer detail: info, properties list, recent service orders, average rating
- Property detail with tabbed layout:
  - **Info tab**: name, city, address, description, activity timeline
  - **Inventory tab**: table of items + AI Inventory Assistant panel
  - **Contracts tab**: contracts list with status badges
  - **Service Visits tab**: service orders list

### Service Catalog
- CRUD table for managing service definitions
- Fields: code, name, description, default unit, default price, active toggle

### Contracts
- Filterable list (by customer, property, status)
- Contract detail: header info, line items table
- Status actions: activate, pause, terminate
- "Generate service visit" button → auto-creates a ServiceOrder from active line items for selected period (week/month)

### Service Visits (ServiceOrders)
- Filterable list (date range, customer, property, status, period)
- Detail view:
  - Header with property, contract, dates, period, status
  - Items with checkboxes for "Delivered", quantity adjustment, notes
  - "Add ad-hoc service" from catalog or custom
  - Save as draft / "Send to client for review" with confirmation dialog
- "Summarize notes for client" AI button on visit notes

### Tasks
- Simple task list linked to property or service visit (title, due date, status)
- Shown on dashboard

### Reporting
- Basic widgets: active contracts count, sessions completed this month, average rating per customer
- Filterable table/chart views by customer, property, date range

---

## Phase 3: Client Portal

### Layout
- Simplified full-width layout, mobile-first
- Navigation: My Properties, My Service Visits, Feedback & Requests

### My Properties
- Card-based list of client's properties
- Property detail: basic info, service history summary, read-only inventory overview

### My Service Visits
- List filtered by status and date
- Detail view:
  - Delivered services grouped by contract vs ad-hoc
  - For SENT_TO_CLIENT status: Approve / Reject buttons (reject captures reason)
  - Feedback section: star rating (1-5) + comment

### Feedback & Ad-hoc Requests
- Past feedback history
- "New request" form: pick property, date window, description, priority
- Creates a draft service order visible to provider as "Ad-hoc request"

---

## Phase 4: AI Features

### AI Inventory Assistant (Edge Function)
- Panel in Property > Inventory tab, labeled "AI Inventory Assistant"
- Provider pastes natural-language description
- Edge function calls Lovable AI (Gemini) with tool-calling to extract structured inventory items
- Returns proposed items displayed as editable form fields (not chat)
- Clarification questions shown inline if needed
- Provider can accept all, edit, or delete lines before saving
- Items saved with source = AI_ASSISTED
- Quick-add buttons: "Add lawn area", "Add trees" with pre-filled forms

### AI Visit Notes Summary (Edge Function)
- "Summarize for client" button on service visit notes
- Generates client-friendly summary via Lovable AI
- Provider reviews before attaching to the service order

### AI Request Parser (Edge Function — optional POC)
- When client submits free-text ad-hoc request, parse into suggested service catalog items
- Show as editable proposed items for provider review

---

## Phase 5: Polish & UX

### Design System
- Colors: primary green #34D399, background #F9FAFB, white cards, dark text #1F2937, amber accent #F59E0B
- Typography: Inter throughout
- Rounded cards, clean spacing, minimal shadows
- Fast transitions, no slow animations

### UX Details
- Breadcrumbs/section headers showing Provider Workspace vs Client Portal context
- AI suggestions clearly labeled: "AI suggestion – please review before saving"
- Confirmation dialogs before sending visits to clients
- Mobile-responsive throughout (especially provider field use)
- Friendly microcopy: "Service Visit" not "ServiceOrder", etc.
- Activity timeline on each property showing key events chronologically

