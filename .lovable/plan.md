

## Plan: Contract Scope Tracking & Service Consumption Visibility

### Problem
Currently there's no way to know if work delivered is within contract scope or extra. Contract line items define services but don't cap how many times each can be consumed per period. There's no consumption tracking or in-scope vs out-of-scope visibility.

### Data Model Change

**Add `max_occurrences_per_period` column to `contract_line_items`:**
- New nullable integer column (null = unlimited)
- Represents the maximum number of times this service can be performed within the line item's `frequency_type` interval
- Example: "Grass cutting, PER_MONTH, max 2" = only 2 grass cuttings per month are covered

This single column, combined with the existing `frequency_type` and `quantity`, gives full granularity:
- "2 grass cuttings per month" → frequency_type=PER_MONTH, max_occurrences_per_period=2
- "1 tree planting per year" → frequency_type=ONE_TIME, max_occurrences_per_period=1
- "Unlimited maintenance per visit" → frequency_type=PER_VISIT, max_occurrences_per_period=null

Consumption is computed by counting `service_order_items` rows with matching `contract_line_item_id` on completed/sent visits within the current period.

### Changes by Area

**1. Database Migration**
- Add `max_occurrences_per_period INTEGER DEFAULT NULL` to `contract_line_items`

**2. Contract Detail (Provider) — `ContractDetail.tsx`**
- Add "Max/Period" column to line items table (editable input)
- Add "Add Line Item" form field for max occurrences
- Add a **Consumption Summary** card for active contracts showing per-line-item: used / allowed this period, with progress bars and in-scope/over-scope badges

**3. Contract Detail (Client) — `ClientContractDetail.tsx`**
- Add "Allowance" info to each line item (e.g. "2/month")
- Add consumption summary card showing used vs allowed per service

**4. Visit Detail (Provider) — `VisitDetail.tsx`**
- For each service order item linked to a contract line item, show badge: "In Scope" (green) or "Extra" (amber/red)
- Extra = the count of completed items for that line item in the current period already meets/exceeds the max

**5. Visit Detail (Client) — `ClientVisitDetail.tsx`**
- Same in-scope/extra badges on each service item
- Billing section already distinguishes CONTRACT vs AD_HOC; enhance with scope status

**6. Service Visits List — `ServiceVisits.tsx`**
- Add a small indicator if visit contains any out-of-scope items

**7. Customer Detail — `CustomerDetail.tsx`**
- In the contracts section, show a mini consumption bar per active contract (% of services consumed this period)

**8. Provider Dashboard — `Dashboard.tsx`**
- Add a new "Over-Scope Alerts" metric or card showing count of visits/items delivered beyond contract limits this month

**9. Shared Consumption Utility**
- Create `src/lib/contract-consumption.ts` with a function that, given a contract ID and period, queries `service_order_items` joined to `service_orders` to compute per-line-item consumption counts vs max_occurrences_per_period

### Technical Details

**Consumption query pattern:**
```sql
SELECT cli.id, cli.max_occurrences_per_period, cli.frequency_type,
       COUNT(soi.id) as consumed
FROM contract_line_items cli
LEFT JOIN service_order_items soi ON soi.contract_line_item_id = cli.id
LEFT JOIN service_orders so ON so.id = soi.service_order_id
  AND so.status IN ('COMPLETED','APPROVED','SENT_TO_CLIENT')
  AND so.performed_date >= [period_start]
  AND so.performed_date <= [period_end]
WHERE cli.contract_id = [contract_id]
GROUP BY cli.id
```

Period boundaries calculated client-side based on `frequency_type`:
- PER_WEEK → current ISO week
- PER_MONTH → current calendar month  
- ONE_TIME → entire contract duration
- PER_VISIT → no cap logic (each visit is independent)

**Files to create:**
- `src/lib/contract-consumption.ts`

**Files to modify:**
- `src/pages/provider/ContractDetail.tsx` — consumption card + max field
- `src/pages/client/ClientContractDetail.tsx` — allowance + consumption
- `src/pages/provider/VisitDetail.tsx` — in-scope/extra badges
- `src/pages/client/ClientVisitDetail.tsx` — in-scope/extra badges
- `src/pages/provider/ServiceVisits.tsx` — over-scope indicator
- `src/pages/provider/CustomerDetail.tsx` — mini consumption bars
- `src/pages/provider/Dashboard.tsx` — over-scope alert metric

