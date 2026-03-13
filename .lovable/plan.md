

## Plan: Unified Sales Pipeline with Kanban + "Create Opportunity" as Client Onboarding

### Core Concept Change
"Create Opportunity" is NOT just creating a draft inspection. It is a **client onboarding entry point** — a dialog that lets the provider either:
1. **Select an existing customer + property** to start the pipeline
2. **Create a new customer inline** (with name, email, phone, company) + create their first property — for cases where the client doesn't have an account yet
3. **Connect via Client ID** (GC-XXXXXX) to link an existing platform user

Once the customer/property is resolved, a DRAFT inspection is created and appears in the "Opportunities" Kanban column.

### New/Modified Files

**New:**
| File | Description |
|---|---|
| `src/pages/provider/SalesPipeline.tsx` | Main page: Kanban board (default) + sub-tab buttons for Inspections/Offers/Contracts tables. Top-right "Create" dropdown. |
| `src/components/provider/PipelineKanban.tsx` | 4-column Kanban: Opportunities → Inspections → Offers → Contracts. Each card clickable to detail page. "Move to next stage" buttons on cards. |
| `src/components/provider/PipelineCreateMenu.tsx` | Dropdown with: Create Opportunity, Create Inspection, Create Offer, Create Contract. Each opens its own dialog. |
| `src/components/provider/CreateOpportunityDialog.tsx` | Multi-step dialog: Tab 1 "Existing Customer" (select customer → property). Tab 2 "New Customer" (inline form: name, email, phone, company + property name/address). Tab 3 "Connect by Client ID" (GC-XXXXXX lookup + connection request). After resolving customer+property → creates DRAFT inspection with a title. |

**Modified:**
| File | Changes |
|---|---|
| `src/components/provider/ProviderSidebar.tsx` | Replace Inspections, Offers, Contracts with single "Sales Pipeline" item at `/provider/pipeline` |
| `src/App.tsx` | Add `/provider/pipeline` route. Redirect `/provider/inspections`, `/provider/offers`, `/provider/contracts` to `/provider/pipeline` (keep detail routes) |
| `src/pages/provider/Inspections.tsx` | Export the list/table as a reusable component (remove outer layout wrapper) so it can be embedded in SalesPipeline sub-tab |
| `src/pages/provider/Offers.tsx` | Same — make embeddable |
| `src/pages/provider/Contracts.tsx` | Same — make embeddable |
| `src/pages/client/ClientDashboard.tsx` | Add "Upcoming Inspections" section querying inspections for client's customer_id |

### Kanban Column Mapping

| Column | Data Source | Statuses |
|---|---|---|
| Opportunities | `inspections` | `DRAFT` |
| Inspections | `inspections` | `COMPLETED`, `OFFER_GENERATED` |
| Offers | `offers` | All statuses |
| Contracts | `contracts` | All statuses |

Each card shows: customer name, property name, status badge, date. Click navigates to detail page. Action button on card for stage transitions (e.g. "Complete", "Generate Offer", "Generate Contract").

### Create Opportunity Dialog Flow

```text
┌─────────────────────────────────────────┐
│  Create Opportunity                      │
│                                          │
│  [Existing Customer] [New Customer] [ID] │
│                                          │
│  Tab 1: Select Customer → Property       │
│  Tab 2: Name, Email, Phone, Company,     │
│          Property Name, Address           │
│          → creates customer + property   │
│  Tab 3: Enter GC-XXXXXX → lookup         │
│          → sends connection request      │
│          → creates customer record       │
│                                          │
│  Title: [________________]               │
│  Notes: [________________]               │
│                                          │
│  [Create Opportunity]                    │
└─────────────────────────────────────────┘
```

For Tab 2 (New Customer): inserts into `customers` table (with tenant_id) and `properties` table, then creates the DRAFT inspection. Client can register later and be linked via the Connect Client flow.

For Tab 3 (Client ID): looks up the profile, sends a `client_connections` request, and if the client already has a `customer` record linked, uses that; otherwise creates a new customer record.

### No Database Changes Required
All existing tables support this flow. The "opportunity" is just a DRAFT inspection with the customer/property association.

### Navigation
- Sidebar: "Sales Pipeline" replaces Inspections + Offers + Contracts (3 items → 1)
- Pipeline page has toggle buttons at top: **Kanban** | **Inspections** | **Offers** | **Contracts**
- Detail routes remain unchanged (`/provider/inspections/:id`, `/provider/offers/:id`, `/provider/contracts/:id`)

