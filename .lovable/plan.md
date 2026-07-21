## Goal

Produce a single authoritative Markdown document that explains how **Contracts → Line Items (Services) → Inventory → Pricing/Frequency/Quantity/Scope Consumption** actually work today, where each concept is managed and displayed, and a proposed model so a provider can confidently set up a recurring contract (e.g. yearly, 2 visits/month) and both sides see clearly what is in-scope, what is extra, and what has been consumed.

## Deliverable

New file: `docs/contracts-services-inventory.md`

## Document outline

1. **TL;DR** — one-page mental model with a worked example: *"Yearly contract, 2 lawn maintenance visits per month, flat monthly fee"*. Shows exactly which fields to set (`billing_cycle`, `frequency_type`, `quantity`, `max_occurrences_per_period`, `unit_price`) and why.

2. **Core concepts & fields** — plain-language definitions of:
   - `contracts.billing_cycle` (MONTHLY/YEARLY/…) — how the *client is charged*
   - `contract_line_items.frequency_type` (PER_VISIT / PER_WEEK / PER_MONTH / PER_YEAR / PER_CONTRACT / ONE_TIME) — how *scope is measured*
   - `quantity` vs `max_occurrences_per_period` — the difference and when each matters
   - `unit_price` — meaning under a flat-fee contract vs pay-per-visit contract (including the "Included in flat fee = 0" rule already in the code)
   - AD_HOC / extra items — items added to a visit that are *not* tied to a contract line

3. **Scope consumption model** — how `getContractConsumption` and `getVisitScopeStatus` (`src/lib/contract-consumption.ts`) count what has been delivered:
   - counts only `service_order_items.is_completed = true` on `service_orders.status = COMPLETED`
   - period boundaries per frequency (week/month/year/contract lifetime)
   - what makes an item "over scope" vs "in scope" vs "extra (ad-hoc)"

4. **Recipes** — copy-pasteable setups for the common cases:
   - Recurring flat-fee (yearly billing, 2 visits/month)
   - Recurring flat-fee (monthly billing, weekly visit)
   - Pay-per-visit (no cap, priced per unit)
   - One-time project (ONE_TIME, fixed price)
   - Mixed: flat-fee base + priced extras
   - How inventory items attach to a visit and when they are billable vs included

5. **Inventory relationship** — how `inventory_items` (property assets) relate to visits and to contract line items; clarifies that inventory tracks *what's on the property* (trees, equipment), separate from *services delivered* on `service_order_items`. Documents current gaps and the intended link.

6. **Where each thing lives (single source of truth map)** — table listing every screen and the fields it reads/writes, so future edits update one place:

   | Concept | DB source | Managed at | Displayed at |
   |---|---|---|---|
   | Contract header (billing_cycle, dates, status) | `contracts` | `ContractNew`, `ContractDetail` | `ContractDetail`, `PropertyContractsTab`, `ClientContracts`, `CustomerDashboard` |
   | Contract line items (service, freq, qty, max, price) | `contract_line_items` | `ContractDetail` | same + `PropertyContractsTab`, `ClientContractDetail` |
   | Consumption (in-scope vs over-scope) | derived via `contract-consumption.ts` | — | `ContractDetail`, `VisitDetail`, `Dashboard` (over-scope KPI) |
   | Visit line items (delivered / extras) | `service_order_items` | `VisitDetail` | `VisitDetail`, `ClientVisitDetail`, `CustomerDetail` |
   | Inventory (property assets) | `inventory_items` | `InventoryTab` | `PropertyDetail`, `VisitDetail` |
   | Invoicing totals | `invoices`, `invoice_line_items` | auto on visit completion + `InvoiceDetail` | `/provider/billing`, `/client/billing`, `CustomerDashboard` |

7. **Known disjoint areas & unification recommendations** — short list of the current friction points I find during exploration (e.g. price shown in USD `$` in `PropertyContractsTab` vs tenant currency elsewhere; "Included in flat fee" logic living only in `ContractDetail`; no visible per-line consumption on the client contract view; ad-hoc pricing UX). Each item flagged as "future unification" without changing behavior in this doc.

8. **Glossary** — one-line definitions for every enum value used above.

## Process

1. Read the current implementations to make sure the doc matches reality — not assumptions:
   - `src/pages/provider/ContractDetail.tsx`, `ContractNew.tsx`
   - `src/lib/contract-consumption.ts` (already have)
   - `src/components/provider/PropertyContractsTab.tsx` (already have)
   - `src/pages/provider/VisitDetail.tsx`, `src/components/visits/VisitActionRow.tsx`
   - `src/pages/client/ClientContractDetail.tsx`, `ClientVisitDetail.tsx`
   - `src/components/provider/InventoryTab.tsx`, invoice generation in `src/lib/invoice-pdf.ts` and billing pages
   - DB shape of `contract_line_items`, `service_order_items`, `inventory_items`, `invoices*` via `supabase--read_query`
2. Write `docs/contracts-services-inventory.md` following the outline above, using the worked example as the anchor throughout.
3. Add a link to it from `README.md` under the domain-model section.

## Scope guardrails

- **Documentation only.** No code, DB, or UI changes in this task.
- Unification recommendations are captured as a section for a future task; nothing is implemented now.
