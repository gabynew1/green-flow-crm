

## Sales Pipeline Implementation Plan

### Overview
Build a complete sales pipeline with 4 linked entities: **Inspection Sheet** → **Offer** → **Contract** → **Visit**, each with its own status workflow. The pipeline flows forward: completing an inspection can generate an offer, accepting an offer creates a contract, and active contracts generate visits.

### Database Changes (1 migration)

**New enum: `inspection_status`**
- `DRAFT`, `COMPLETED`, `OFFER_GENERATED`

**New enum: `offer_status`**
- `DRAFT`, `IN_PROGRESS`, `SENT_TO_CLIENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELED`

**Update enum: `contract_status`** — replace current values with:
- `DRAFT`, `SENT_TO_CLIENT`, `SIGNED`, `ACTIVE`, `CLOSED`
(Remove `PENDING_NEW`, `PAUSED`, `TERMINATED`, `REJECTED`)

**Update enum: `service_order_status`** — replace current values with:
- `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `PENDING_APPROVAL`, `APPROVED`, `SENT_TO_CLIENT`, `CANCELED`
(Remove `DRAFT`, `CLIENT_APPROVED`, `CLIENT_REJECTED`)

**New table: `inspections`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| property_id | uuid FK → properties | |
| customer_id | uuid FK → customers | |
| tenant_id | uuid | |
| status | inspection_status | default `DRAFT` |
| title | text | |
| notes | text | nullable |
| findings | text | nullable |
| inspected_date | date | nullable |
| created_by | uuid | |
| created_at / updated_at | timestamptz | |

RLS: Providers manage all (tenant-scoped); Clients can SELECT their own (via customer_id).

**New table: `offers`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| inspection_id | uuid FK → inspections | nullable |
| property_id | uuid FK → properties | |
| customer_id | uuid FK → customers | |
| tenant_id | uuid | |
| status | offer_status | default `DRAFT` |
| offer_name | text | |
| notes | text | nullable |
| rejection_comment | text | nullable |
| valid_until | date | nullable |
| total_value | numeric | nullable |
| created_by | uuid | |
| created_at / updated_at | timestamptz | |

RLS: Providers manage all; Clients can SELECT their own + UPDATE status (for accept/reject).

**New table: `offer_line_items`**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| offer_id | uuid FK → offers | |
| service_catalog_id | uuid FK | |
| custom_name | text | nullable |
| quantity | numeric | default 1 |
| unit_price | numeric | nullable |
| unit | text | nullable |
| notes | text | nullable |
| created_at / updated_at | timestamptz | |

RLS: Providers manage all; Clients can SELECT (via offer → customer join).

### Status Workflow Logic (Provider → Client)

```text
INSPECTION          OFFER              CONTRACT           VISIT
─────────          ─────              ────────           ─────
Draft        →     Draft        →     Draft        →    Scheduled
Completed    →     In Progress        Sent to Client    In Progress
Offer Generated    Sent to Client  ←  Signed            Completed
                   Accepted     →     Active             Pending Approval
                   Rejected           Closed              Approved
                   Expired                                Sent to Client
                   Canceled                               Canceled
```

**Transitions:**
- Inspection `COMPLETED` → Provider clicks "Generate Offer" → creates
<lov-tool-use id="thinking-5b3a742c-e0e8-4cb1-abbb-eab390da3879" name="lov-think" data="Let me continue the plan from where it was cut off." duration="0.881991">
</lov-tool-use>
<lov-plan>

## Sales Pipeline Implementation Plan

### Overview
Build a complete sales pipeline with 4 linked entities: **Inspection Sheet** → **Offer** → **Contract** → **Visit**, each with its own status workflow. The pipeline flows forward: completing an inspection can generate an offer, accepting an offer creates a contract, and active contracts generate visits.

### Database Changes (1 migration)

**New enum: `inspection_status`** — `DRAFT`, `COMPLETED`, `OFFER_GENERATED`

**New enum: `offer_status`** — `DRAFT`, `IN_PROGRESS`, `SENT_TO_CLIENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELED`

**Update enum: `contract_status`** — add `SENT_TO_CLIENT`, `SIGNED`, `CLOSED` (keep `DRAFT`, `ACTIVE`; remove `PENDING_NEW`, `PAUSED`, `TERMINATED`, `REJECTED`)

**Update enum: `service_order_status`** — replace with `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `PENDING_APPROVAL`, `APPROVED`, `SENT_TO_CLIENT`, `CANCELED`

**New table: `inspections`** — id, property_id (FK), customer_id (FK), tenant_id, status, title, notes, findings, inspected_date, created_by, timestamps. RLS: providers manage all; clients SELECT own.

**New table: `offers`** — id, inspection_id (FK nullable), property_id (FK), customer_id (FK), tenant_id, status, offer_name, notes, rejection_comment, valid_until, total_value, created_by, timestamps. RLS: providers manage all; clients SELECT own + UPDATE status for accept/reject.

**New table: `offer_line_items`** — id, offer_id (FK), service_catalog_id (FK), custom_name, quantity, unit_price, unit, notes, timestamps. RLS: providers manage all; clients SELECT via offer join.

### Status Transition Rules

```text
INSPECTION              OFFER                CONTRACT             VISIT
──────────              ─────                ────────             ─────
Draft             →     Draft           →    Draft           →   Scheduled
Completed         →     In Progress          Sent to Client      In Progress
Offer Generated         Sent to Client  →    Signed              Completed
                        Accepted        →    Active              Pending Approval
                        Rejected             Closed              Approved
                        Expired                                  Sent to Client
                        Canceled                                 Canceled
```

**Key transitions:**
- Inspection `COMPLETED` → "Generate Offer" button → creates offer with inspection data, sets inspection to `OFFER_GENERATED`
- Offer `ACCEPTED` (by client) → "Generate Contract" button → creates contract from offer line items, sets offer linked
- Contract `ACTIVE` → visits can be created/scheduled
- Visit `COMPLETED` → `PENDING_APPROVAL` → provider reviews → `APPROVED` → `SENT_TO_CLIENT` for client visibility

**Client-side actions:**
- Offers: client can Accept or Reject (with comment) when status is `SENT_TO_CLIENT`
- Contracts: client can view, no action needed (signed offline or via button)
- Visits: client can view visits in `SENT_TO_CLIENT` status

### New Pages & Components

| File | Description |
|---|---|
| `src/pages/provider/Inspections.tsx` | List all inspections with search/filter, create new |
| `src/pages/provider/InspectionDetail.tsx` | View/edit inspection, "Complete" and "Generate Offer" actions |
| `src/pages/provider/Offers.tsx` | List all offers with search/filter/status tabs |
| `src/pages/provider/OfferDetail.tsx` | View/edit offer, manage line items, "Send to Client" action |
| `src/pages/client/ClientOffers.tsx` | Client views offers, accept/reject sent offers |
| `src/pages/client/ClientOfferDetail.tsx` | Client views full offer details before deciding |

### Modified Files

| File | Changes |
|---|---|
| `src/pages/provider/Contracts.tsx` | Update status labels/colors for new statuses (SENT_TO_CLIENT, SIGNED, CLOSED) |
| `src/pages/provider/ContractDetail.tsx` | Update status actions to match new workflow |
| `src/pages/provider/ServiceVisits.tsx` | Update status labels/colors for new visit statuses |
| `src/pages/provider/VisitDetail.tsx` | Add workflow buttons (Start → Complete → Submit for Approval → Approve → Send to Client) |
| `src/pages/client/ClientContracts.tsx` | Update to new contract statuses, remove old approve/reject (contracts are now signed) |
| `src/pages/client/ClientVisits.tsx` | Update visit status display |
| `src/components/provider/ProviderSidebar.tsx` | Add "Inspections" and "Offers" nav items |
| `src/components/client/ClientLayout.tsx` | Add "Offers" nav item |
| `src/App.tsx` | Add routes for all new pages |
| `src/pages/provider/Dashboard.tsx` | Add pipeline KPIs (inspections pending, offers awaiting response, etc.) |

### Pipeline Visual on Dashboard
Add a horizontal pipeline summary bar at the top of the provider dashboard showing counts at each stage:
```text
[Inspections: 3] → [Offers: 5] → [Contracts: 8] → [Visits: 12]
```
Each clickable, linking to the respective list page.

### Implementation Order
1. Database migration (new tables, updated enums)
2. Inspections pages (provider create/list/detail)
3. Offers pages (provider create/list/detail + client accept/reject)
4. Update Contracts and Visits to new statuses
5. Update sidebar navigation and routing
6. Dashboard pipeline summary
7. Client-side offers page

