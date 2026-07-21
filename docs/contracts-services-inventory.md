# Contracts → Services → Inventory → Pricing

**Purpose.** This is the single source of truth for how a contract, its services, the visits it produces, and the property inventory relate to each other — and where every field is managed and displayed. If something here disagrees with the UI, the UI is wrong.

Audience: providers setting up contracts, and future engineers/agents changing any of the screens listed in §6.

---

## 1. TL;DR — the mental model

There are **four independent axes** that people confuse:

| Axis | Answers | Field |
|---|---|---|
| **How the client is billed** | "invoice cadence" | `contracts.billing_cycle` (MONTHLY / YEARLY / …) |
| **How often the team visits** | "site cadence" | `contracts.visit_frequency_count` × `visit_frequency_type` (e.g. `2 × MONTH`) — drives the scheduler |
| **How scope is measured per line item** | "what counts as 'included'" | `contract_line_items.frequency_type` + `max_occurrences_per_period` |
| **How each line item is priced** | "money" | `contract_line_items.unit_price` (or `NULL` = included in flat fee) |

These are set independently. A yearly-billed contract can still send 2 visits/month, with each visit including 1 mowing and up to 4 hedge trims/month, at a flat monthly fee.

### Worked example — the one everyone asks about

> *Yearly contract, 2 lawn-maintenance visits per month, flat monthly fee of 800 RON. Fertilization is included up to 4×/year. Extra branch removal is billed per visit at 150 RON/hour.*

On the **contract header** (`ContractNew` / `ContractDetail`):

| Field | Value |
|---|---|
| `billing_cycle` | `MONTHLY` *(the fee is monthly, even though the term is one year — the yearly aspect is `start_date` → `end_date`)* |
| `start_date` / `end_date` | today / today + 1 year |
| `visit_frequency_count` × `visit_frequency_type` | `2` × `MONTH` — scheduler produces 2 visits/month |
| Flat fee | `800` RON, frequency `PER_MONTH` |

Then add **line items**:

| Service | `frequency_type` | `quantity` | `max_occurrences_per_period` | `unit_price` |
|---|---|---|---|---|
| Lawn mowing (included) | `PER_MONTH` | `1` | `2` | `NULL` — *"Included in flat fee"* |
| Fertilization (included, capped yearly) | `PER_YEAR` | `1` | `4` | `NULL` |
| Branch removal (extra, priced) | `PER_VISIT` | `1` | *(leave empty)* | `150` |

Reading it back:
- "Up to **2 mowings per month** count as in-scope; the 3rd would be flagged **over-scope**."
- "Up to **4 fertilizations per year** are included; extras are over-scope."
- "Branch removal is **always billable** at 150 RON per unit delivered — it has no cap."
- Client sees a single **800 RON/month** invoice; extras appear as **separate line items** on the visit's auto-generated invoice.

---

## 2. Core concepts & fields

### 2.1 `contracts.billing_cycle`
How often the client is **invoiced**. Independent of visit cadence. Values today: `MONTHLY`, `YEARLY` (extend cautiously). Used by `ClientBilling`'s "next payment" projection and by invoice-period rollups.

### 2.2 `contracts.visit_frequency_count` / `visit_frequency_type`
How often the team **goes to site**. Consumed by `src/lib/schedule-engine.ts` when activating the contract and by `GenerateNext30Dialog`. This drives calendar seeding — it does **not** by itself gate scope.

### 2.3 `contract_line_items.frequency_type`
The **scope period** for that single service line. It defines the window that `max_occurrences_per_period` counts against:

| Value | Period window | Typical use |
|---|---|---|
| `PER_VISIT` | *(no window)* | Priced per-visit extras with no cap |
| `PER_WEEK` | Mon–Sun | "Trash pickup, max 2 per week" |
| `PER_MONTH` | 1st–last of month | "Mowing, max 2 per month" |
| `PER_YEAR` | Jan 1 – Dec 31 | "Fertilization, max 4 per year" |
| `PER_CONTRACT` | contract lifetime | "One aeration this season" |
| `ONE_TIME` | contract lifetime | Project work, single delivery |

> Period boundaries are computed by `getPeriodBounds` in `src/lib/contract-consumption.ts`. `PER_VISIT` intentionally returns `null` — no scope tracking.

### 2.4 `quantity` vs `max_occurrences_per_period`
They are **not** the same:

- **`quantity`** — how many *units* the line represents at billing/valuation time. On a flat-fee line it's usually `1`. On a priced line it's the count that multiplies `unit_price` to compute the row total (`ContractDetail` shows `unit_price × quantity`).
- **`max_occurrences_per_period`** — how many *deliveries* are considered in-scope per period. Once exceeded, consumption flags the line **over-scope**.

Rule of thumb: `quantity` is a **money** concept; `max_occurrences_per_period` is a **scope** concept.

### 2.5 `unit_price` — flat-fee vs pay-per-visit
- **`unit_price = NULL`** ⇒ the line is *included in the contract's flat fee*. Provider and client see **"Included"** / **0**. This is the pattern `ContractNew` uses when the provider enters a flat fee: the fee is saved as a separate flat-fee line, and each included service line is saved with `unit_price = NULL`.
- **`unit_price > 0`** ⇒ the line is **billable per unit delivered**. It appears on the visit's auto-generated invoice.

`VisitDetail` falls back through: `service_order_items.unit_price` → the linked `contract_line_items.unit_price` → `service_catalog.default_price`.

### 2.6 AD_HOC / extras on a visit
A `service_order_items` row with `contract_line_item_id = NULL` is an **ad-hoc extra** — added at the visit, not part of the contract. It's always **out of scope** and always **billable** at whatever `unit_price` the tech enters.

---

## 3. Scope consumption — how "in-scope / over-scope / extra" is computed

All logic lives in **`src/lib/contract-consumption.ts`** (`getContractConsumption`, `getVisitScopeStatus`). Do not reimplement it elsewhere.

Rules, in order:

1. Only `service_order_items` with `is_completed = true` on a `service_orders` row with `status = COMPLETED` are counted. In-progress or cancelled visits do not consume scope.
2. Each item is bucketed against its line item's period window (see §2.3), using `performed_date` if set, otherwise `scheduled_date`.
3. Consumption is compared to `max_occurrences_per_period`:
   - `max = NULL` → **unlimited**, never over-scope.
   - `consumed < max` → **in-scope**.
   - `consumed ≥ max` → **over-scope** (surfaces as a warning; does not block delivery).
4. Items with `contract_line_item_id = NULL` (§2.6) are labeled **extra**, never in-scope.

The `Dashboard` "over-scope" KPI is `getOverScopeCount()` — a sum across all `ACTIVE` contracts.

---

## 4. Recipes

### 4.1 Recurring flat-fee, 2 visits/month, yearly term
See §1 worked example. Set `billing_cycle = MONTHLY`, `visit_frequency = 2 × MONTH`, one flat-fee line, one included mowing line (`PER_MONTH`, `max = 2`, `unit_price = NULL`).

### 4.2 Recurring flat-fee, weekly visit, monthly bill
`billing_cycle = MONTHLY`, `visit_frequency = 1 × WEEK`, one flat-fee line, one included mowing line `PER_WEEK`, `max = 1`, `unit_price = NULL`.

### 4.3 Pay-per-visit, no cap
No flat-fee line. Each service line: `frequency_type = PER_VISIT`, `max = NULL`, `unit_price > 0`. Every completed delivery generates a billable row.

### 4.4 One-time project
`billing_cycle = MONTHLY` (or set `end_date` = single billing point), one line: `frequency_type = ONE_TIME`, `quantity = 1`, `unit_price = <project total>`.

### 4.5 Mixed — flat-fee base + priced extras
Combine 4.1 with 4.3. Included lines carry `unit_price = NULL`; extras carry `unit_price > 0` and `PER_VISIT`.

### 4.6 Inventory on a visit
Inventory items (`inventory_items`) are **property assets** — the trees, irrigation zones, equipment on-site. They are referenced from a visit for context (what was worked on) but they are **not billed** and do **not consume contract scope** on their own. Billing/scope is always driven by `service_order_items`.

---

## 5. Inventory relationship

- `inventory_items` describes what's on the property; managed on `PropertyDetail` → Inventory tab (`InventoryTab.tsx`).
- A visit's Inventory section lists these same rows for reference; ticking a service on the visit does **not** modify inventory.
- If a service is *about* a specific asset (e.g. "prune tree #4"), the tech notes the asset in the item description. There is no hard FK today — this is an intentional §7 unification item.

---

## 6. Where each thing is managed and displayed (single-source-of-truth map)

If you change a field, check the "Displayed at" column for every consumer.

| Concept | DB source | Managed at | Displayed at |
|---|---|---|---|
| Contract header (`billing_cycle`, dates, `visit_frequency_*`, `status`) | `contracts` | `pages/provider/ContractNew.tsx`, `pages/provider/ContractDetail.tsx` | `ContractDetail`, `components/provider/PropertyContractsTab.tsx`, `pages/client/ClientContracts.tsx`, `pages/client/ClientContractDetail.tsx`, `components/provider/CustomerDashboard.tsx` |
| Contract line items (`frequency_type`, `quantity`, `max_occurrences_per_period`, `unit_price`, `custom_name`) | `contract_line_items` | `ContractNew`, `ContractDetail` (inline edits) | `ContractDetail`, `PropertyContractsTab`, `ClientContractDetail`, `VisitDetail` (via `contract_line_item_id` join) |
| Flat-fee detection ("Included in flat fee") | `contract_line_items.unit_price IS NULL` on a line with a sibling flat-fee row | `ContractNew`, `ContractDetail` | `ContractDetail`, `VisitDetail` (`contractFlatFee` state) |
| Scope consumption (in-scope / over-scope / extra) | derived from `service_order_items` + `contract_line_items` | — (derived) | `ContractDetail`, `VisitDetail`, `pages/provider/Dashboard.tsx` KPI |
| Visit line items (delivered / extras / per-item price) | `service_order_items` | `VisitDetail` (checkbox `is_completed`, `unit_price`), `CreateAdHocVisitDialog` | `VisitDetail`, `ClientVisitDetail`, `CustomerDetail` (recent visits), `Billing` (via invoice) |
| Visit status (`SCHEDULED / IN_PROGRESS / COMPLETED / CANCELED`) | `service_orders.status` | `components/visits/VisitActionRow.tsx` | everywhere visits render (`ServiceVisits`, `VisitRow`, calendar) |
| Inventory (property assets) | `inventory_items` | `components/provider/InventoryTab.tsx` on `PropertyDetail` | `PropertyDetail`, `VisitDetail` (context list) |
| Service catalog (shared templates, prices) | `service_catalog` (+ `service_catalog_translations`) | `pages/provider/ServiceCatalog.tsx`, `scripts/update_catalog.ts` | contract editors, visit item picker |
| Invoicing | `invoices`, `invoice_line_items`, `invoice_payments` | auto-generated on visit `COMPLETED`; edits on `pages/provider/InvoiceDetail.tsx` | `/provider/billing`, `/client/billing`, `CustomerDashboard` "De încasat" tile |

**Rule for future changes:** add a new consumer? Update the row above. Add a new managed screen? Migrate the write path into `ContractDetail` / `VisitDetail` / `InventoryTab` rather than duplicating.

---

## 7. Known disjoint areas — unification backlog

These are documented here so we fix them once and only once. **Do not** patch these in this doc's scope; open a task.

1. **Currency symbol drift.** `PropertyContractsTab.tsx` renders totals with a hardcoded `$` (line ~68); `ClientContractDetail.tsx` also uses `$` while `ContractDetail` uses `formatCurrency(..., currency)`. All should route through `useTenantCurrency` + `formatCurrency`.
2. **Flat-fee heuristic is local.** `VisitDetail` detects flat-fee by querying sibling contract lines. Extract a `getContractPricingMode(contractId)` helper and reuse in `ContractDetail`, `Billing`, and PDF generation.
3. **Per-line consumption not shown to client.** `ClientContractDetail` prints `max`/`frequency_type` but not `consumed / max` for the current period. Reuse `getContractConsumption` there.
4. **Ad-hoc item pricing UX.** Two inputs on `VisitDetail` (checkbox + price) with different semantics for in-scope vs extra. Consider a single "billable?" toggle backed by the derived scope status.
5. **Inventory ↔ visit item link is informal.** No FK from `service_order_items` to `inventory_items`. Add optional `inventory_item_id` when we introduce asset-level history.
6. **Two "frequency" concepts on the contract.** `visit_frequency_*` (site cadence) vs line-item `frequency_type` (scope window) are easy to confuse in the UI. The contract editor should render them under distinct headings ("Visit schedule" vs "What's included per line").
7. **Invoice generation coupling.** Auto-invoice on visit `COMPLETED` lives inline in `VisitActionRow`; move to a single `finalizeVisit(visitId)` service so re-billing or corrections have one entry point.

---

## 8. Glossary

- **Contract** — the agreement between provider and client for a property, over a date range, at a billing cadence.
- **Line item** — one service line inside a contract, defining scope (frequency + max) and price.
- **Flat-fee line** — a line whose `unit_price` is the periodic fee; sibling service lines carry `unit_price = NULL` and are "included".
- **Visit / service order** — a scheduled or completed on-site appointment (`service_orders`).
- **Visit item** — a service performed at a visit (`service_order_items`). May reference a `contract_line_item_id` (in-scope) or `NULL` (extra).
- **In-scope** — a completed visit item within its line's `max_occurrences_per_period` window.
- **Over-scope** — a completed visit item beyond that cap; still delivered, flagged for review/billing.
- **Extra / ad-hoc** — a visit item with no `contract_line_item_id`; always billable.
- **Inventory item** — a physical asset on the property; catalog-only, not billed.
- **`billing_cycle`** — `MONTHLY | YEARLY` — invoice cadence.
- **`visit_frequency_type`** — `WEEK | MONTH | …` — site cadence.
- **`frequency_type`** — `PER_VISIT | PER_WEEK | PER_MONTH | PER_YEAR | PER_CONTRACT | ONE_TIME` — scope window for one line.

*Last reviewed against code: `ContractNew.tsx`, `ContractDetail.tsx`, `VisitDetail.tsx`, `ClientContractDetail.tsx`, `PropertyContractsTab.tsx`, `contract-consumption.ts`.*