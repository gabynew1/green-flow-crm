

## Improvement Suggestions for GreenCRM

### 1. Client-Side: Pending Contract Notifications on Dashboard
The client dashboard shows upcoming visits and properties but has **no indication of pending contracts** awaiting approval. Clients could miss new contracts.
- Add a prominent alert/banner at the top of `ClientDashboard` showing count of `PENDING_NEW` contracts with a direct link to `/client/contracts`.
- Add a badge counter on the "Contracts" nav item in `ClientLayout` header.

### 2. Provider Dashboard: Pending Contracts KPI
The provider dashboard tracks customers, contracts, visits, and ratings but **doesn't show pending contracts** awaiting client approval. Add a KPI card for "Pending Approval" count and a section listing contracts in `PENDING_NEW` status.

### 3. Client-Side: Contract Detail View
Clients can approve/reject contracts but **cannot view full contract details** (line items, total value, visit frequency) before deciding. Add a contract detail page at `/client/contracts/:contractId` showing all terms, line items, and pricing so clients can make informed decisions.

### 4. Data Consistency: RLS for Client Contract Updates
Currently clients can only SELECT contracts (via RLS). The approve/reject actions in `ClientContracts.tsx` call `.update()` but **there's no UPDATE RLS policy on the contracts table for clients**. This means approve/reject silently fails. Need an RLS policy allowing clients to update status on contracts linked to their properties.

### 5. Empty States and Loading States
Many pages (Contracts, Customers, Service Visits) lack proper loading spinners — they show empty content briefly before data loads. Add consistent skeleton loaders or a loading state across all list pages.

### 6. Mobile Navigation Overflow
The client mobile nav bar renders all 5 items in a single row. On small screens, text overflows. Consider collapsing to icons-only on mobile or using a hamburger menu.

### 7. Search on Client Contracts Page
The client contracts page has no search or filtering. As contracts accumulate, clients need the ability to filter by status (Active, Pending, Rejected) similar to the provider side.

### 8. Contract End Date Alerts
Contracts nearing expiration have no automated visibility. Add:
- A "Expiring Soon" badge on contracts within 30 days of `end_date`
- A dashboard widget for both provider and client showing contracts expiring in the next 30 days

### 9. Audit Trail / Activity Log Integration
The `activity_log` table exists but isn't being populated for contract actions (creation, approval, rejection). Log these events for accountability and history tracking.

### Priority Order
| # | Improvement | Impact | Effort |
|---|---|---|---|
| 4 | Fix client contract UPDATE RLS | Critical (broken feature) | Small |
| 1 | Client pending contract notifications | High | Small |
| 3 | Client contract detail view | High | Medium |
| 2 | Provider pending contracts KPI | Medium | Small |
| 7 | Client contracts filtering | Medium | Small |
| 8 | Expiration alerts | Medium | Medium |
| 5 | Loading states | Low | Small |
| 6 | Mobile nav fix | Low | Small |
| 9 | Activity log for contracts | Low | Medium |

### Recommendation
Start with **item 4** (RLS fix) since approve/reject is currently broken without a client UPDATE policy on contracts. Then tackle items 1-3 for the biggest UX improvements.

