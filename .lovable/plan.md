## What you actually want

In the **New Contract** flow (`/provider/contracts/new`), once you pick a Regular-Maintenance category and enter a flat fee, every auto-added service should inherit the **allowance** you already declared at the top of the form:

> `visit_frequency_count × visit_frequency_type` → each included line's `frequency_type` + `max_occurrences_per_period`.

Example: `2 × MONTH` → every service = `PER_MONTH`, max `2`. With a 10-month start→end, that's ≈ 20 visits — surfaced as a helper line, not a new field.

Today the flat-fee branch inserts every service with `frequency_type = "PER_VISIT"` (the `defaultCfg()`) and `max = NULL`, which reads as "Unlimited". That's the bug.

## Changes — `src/pages/provider/ContractNew.tsx` only

### 1. Derive a single allowance preset from the header
Add a memo:
```
allowancePreset = {
  frequency_type: visitType === "WEEK"  ? "PER_WEEK"
                 : visitType === "MONTH" ? "PER_MONTH"
                 : visitType === "YEAR"  ? "PER_YEAR"
                 : "PER_MONTH",
  max: visitCount,
}
```

### 2. Apply the preset when Regular-Maintenance auto-selects services
In the existing `useEffect` that seeds `selectedServiceIds` for `isFlatFeeMode`, when initializing each `serviceConfig[id]`, set `frequency_type = allowancePreset.frequency_type` and `max_occurrences = String(allowancePreset.max)`.

### 3. Re-sync when the user changes visit frequency after selecting
Second `useEffect` keyed on `[visitCount, visitType, isFlatFeeMode]`: for every service still holding the *current* preset (i.e. the user hasn't hand-edited it), overwrite `frequency_type` and `max_occurrences` with the new preset. Track "user-edited" with a small `overriddenServiceIds` Set updated inside `updateServiceConfig`.

### 4. Fallback in the insert path
Even if state gets out of sync, harden the flat-fee branch (line 265–277) to fall back to `allowancePreset` when `cfg.frequency_type === "PER_VISIT"` and `cfg.max_occurrences === ""`. Guarantees no more "Unlimited" surprises on save.

### 5. Helper text under the flat-fee card
Under the flat-fee amount input, render a muted line:
> *"Every included service inherits **{count}× {period}** ({months} months → ≈ **{totalVisits}** visits total). You can override per service below."*

`months` computed from `startDate` / `endDate`; if either is missing, show just the per-period line.

## Explicitly out of scope
- No DB migration, no schema changes.
- `ContractDetail.tsx` "Add Line Item" defaults stay as-is (separate follow-up if you want the same behavior there).
- No changes to invoice generation, scheduling engine, or the "Additional Billable Services" path.
- Existing contracts already saved with unlimited allowance are **not** rewritten — this only fixes new contracts. Say the word if you want a one-shot backfill for existing DRAFT contracts.

## Verification
- Pick `2 × MONTH`, category = Regular Maintenance, 10-month term → every auto-added row shows `PER_MONTH` / `2` in the per-service panel, and the helper reads "≈ 20 visits total".
- Change to `1 × WEEK` afterwards → rows the user didn't touch flip to `PER_WEEK` / `1`; rows the user hand-edited stay put.
- Save the contract → `contract_line_items.max_occurrences_per_period = 2`, `frequency_type = PER_MONTH` for each included service.
