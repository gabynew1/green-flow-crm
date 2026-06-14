# Visit calendar date + flat-fee contract pricing

## 1. Calendar: completed visits appear on their performed date

Display-only change — `service_orders.scheduled_date` is never overwritten, so audit history is preserved.

**File:** `src/pages/provider/ServiceVisits.tsx`

- Introduce a small helper:
  ```ts
  const visitDisplayDate = (o: any) =>
    o.status === "COMPLETED" && o.performed_date
      ? parseISO(o.performed_date)
      : o.scheduled_date ? parseISO(o.scheduled_date) : null;
  ```
- Replace every use of `parseISO(o.scheduled_date)` that drives calendar placement with `visitDisplayDate(o)`. Affected spots:
  - `getOrdersForDate` (day / week / month grids and the day list).
  - `getDaySlotInfo` (team slot occupancy chips).
- List view (`filtered` block) is unchanged — it's a list, not a calendar, and the "· {period_label || scheduled_date}" label stays as-is so users still see what was scheduled vs what was performed (performed_date is already shown on the visit detail).
- No DB or query changes — `performed_date` is already on `service_orders` and returned by the existing select.

## 2. Flat-fee contract: included services priced at 0, ad-hoc still billed

**Detection rule (no schema change needed):** a contract is "flat-fee" when its `contract_line_items` contains a row whose `custom_name` starts with `"Flat fee"` (this is exactly what `ContractNew.tsx` writes today when the category is `Regular Maintenance`). The flat-fee row itself carries the recurring price (e.g. 400 RON); the per-service rows are inserted with `unit_price = null` and represent scope only.

**File:** `src/pages/provider/VisitDetail.tsx`

- After `load()` fetches `order`, also fetch the contract's line items when `order.contract_id` is set:
  ```ts
  const { data: cli } = await supabase
    .from("contract_line_items")
    .select("custom_name, unit_price, frequency_type")
    .eq("contract_id", order.contract_id);
  ```
  Store in state: `contractFlatFee: { isFlat: boolean; amount: number; frequency: string | null }`.
  - `isFlat = cli?.some(r => r.custom_name?.startsWith("Flat fee"))`
  - `amount = cli?.find(r => r.custom_name?.startsWith("Flat fee"))?.unit_price ?? 0`
  - `frequency = …frequency_type` (used only for the label, e.g. "Flat fee · per month").
- Update `getItemPrice(item)` so contract-sourced items return `0` when `contractFlatFee.isFlat` is true:
  ```ts
  const getItemPrice = (item: any): number => {
    if (item.source === "CONTRACT" && contractFlatFee.isFlat) return 0;
    return item.unit_price
      ?? item.contract_line_items?.unit_price
      ?? item.service_catalog?.default_price
      ?? 0;
  };
  ```
  Contract line items keep rendering with their names, quantities, and a `0` price tag — exactly as requested ("keep the line items with 0 cost").
- Recompute totals:
  - `contractTotal` becomes `0` automatically (it already sums `getItemCost`).
  - Add a new constant in the totals block:
    ```ts
    const flatFeeAmount = contractFlatFee.isFlat ? contractFlatFee.amount : 0;
    const visitTotal = flatFeeAmount + adHocTotal;
    ```
- Cost summary card (the existing totals section) gets a new row above "Ad-hoc" when `isFlat`:
  - Label: `Contract flat fee` with a small muted sublabel "covers included services" and the frequency suffix (`/ month`, `/ year`, etc.).
  - Value: `formatCurrency(flatFeeAmount, currency)`.
- Per-line rendering: each contract line keeps its name; the price column shows `formatCurrency(0, currency)` with a muted "Included in flat fee" hint (only when `isFlat`).
- No changes to ad-hoc handling — `adHocTotal` and the existing "additional billing" warning in the Complete dialog keep working unchanged.

## Out of scope

- No schema migrations.
- No changes to contract creation/edit UI, offers, invoices, client-side contract pages, or the visit-report email body (numbers there already derive from line-item totals — once `unit_price` for flat-fee contracts is null on per-service rows, those naturally render as 0 in the email's `hasAdditionalCost` flag, which depends only on ad-hoc count and is unaffected).
- No changes to `ServiceVisits` list filtering or search.

## Technical notes

- Files touched: `src/pages/provider/ServiceVisits.tsx`, `src/pages/provider/VisitDetail.tsx`.
- All logic is presentational; no edge functions, RLS, or types regeneration needed.
- Multi-property contracts: detection is per-`contract_id`, which already matches the visit's contract, so multi-property is handled correctly.
