## Goal

Show a live **Total price** helper next to the **Category** selector in `New Contract`, so the provider sees the running cost as they tick services and tweak amounts. Works for **all categories**, including Regular Maintenance.

## Behavior

- Helper appears as a compact box on the **right side of the Category row**, aligned with the Category dropdown.
- Updates live as the user:
  - Checks/unchecks services in the catalog table.
  - Edits per-service `quantity` or `unit price` (non-Maintenance categories).
  - Edits the `Flat fee` input (Regular Maintenance).
  - Changes the billing cycle (only affects the `/ month`, `/ year`, `/ cycle` suffix).
- Empty state: shows `Total: 0 RON` in muted text.
- Sub-line shows `N services selected`.

### Non-Maintenance categories
Total = sum over selected services of `quantity × unit_price`.
- Uses the value in each per-service config card.
- For services that were just ticked but haven't been opened yet, falls back to `default_price × 1` (matches what `defaultCfg(svc.default_price)` already seeds).
- Skips lines with empty/`NaN` unit prices.
- Result wrapped in `Math.ceil` to match the project's CEIL rounding rule.
- Suffix: no `/period` suffix on the main amount (per-line frequencies vary); just `Total: X RON`.

### Regular Maintenance (flat-fee mode)
Total = the `flatFee` value, displayed as `Flat: 1,200 RON / month` (or `/ year`, `/ cycle`).
- If `flatFee` empty or 0: shows `Flat: 0 RON / month` muted.

## Layout

```text
[ Category ▼  Garden Landscaping ]                 [ Total: 1,250 RON ]
                                                     3 services selected
```

The Category field stops being `max-w-xs` standalone and becomes the left half of a flex row; the helper box sits on the right, right-aligned. On small screens it wraps under the dropdown.

## Technical notes

- File touched: `src/pages/provider/ContractNew.tsx` only.
- Add a `useMemo` `servicesTotal`:
  ```ts
  const servicesTotal = useMemo(() => {
    if (isFlatFeeMode) return Number(flatFee) || 0;
    let sum = 0;
    for (const id of selectedServiceIds) {
      const cfg = serviceConfig[id];
      const svc = services.find((s) => s.id === id);
      const qty = Number(cfg?.quantity ?? 1) || 0;
      const price = cfg?.unit_price !== undefined && cfg?.unit_price !== ""
        ? Number(cfg.unit_price)
        : Number(svc?.default_price ?? 0);
      if (!Number.isNaN(price)) sum += qty * price;
    }
    return Math.ceil(sum);
  }, [isFlatFeeMode, flatFee, selectedServiceIds, serviceConfig, services]);
  ```
- Restructure the Category block (around line 423) from a single `max-w-xs` div into a `flex items-end justify-between gap-4 flex-wrap` row containing:
  - Left: existing `Label` + `Select` (kept in a `max-w-xs` wrapper).
  - Right: a small bordered box (`rounded-md border bg-muted/30 px-3 py-2 text-right`) showing:
    - Top line: `Total: {servicesTotal.toLocaleString()} {currency}` for non-Maintenance, or `Flat: {…} / {billingCyclePeriod}` for Maintenance.
    - Bottom line (muted, `text-xs`): `{selectedServiceIds.length} service(s) selected`.
- Reuse `useTenantCurrency()` (already imported) and existing `billingCyclePeriod`.
- Keep the existing right-column Summary card untouched — it still shows the same numbers in the rollup.
- No save/validation logic changes.

## Out of scope

- Discounts, taxes, VAT.
- Per-period normalization across mixed frequencies (a `PER_VISIT` line stays multiplied by quantity only — same model as the rest of the app).
- Persisting the helper anywhere; it's pure UI.
