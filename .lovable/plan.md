## Fixes for outstanding QA findings

### 1. Fix 4 — `PER_CONTRACT` frequency regression (real bug)
- `src/pages/provider/ContractNew.tsx` line 429–436: the top-level "Visits" selector still only lists `WEEK`/`MONTH`/`YEAR`. Add `<SelectItem value="CONTRACT">per Contract</SelectItem>`, and hide the numeric `visitCount` selector (or force it to 1) when `visitType === "CONTRACT"`, matching the per-service dropdown at line 647.
- Persist `visit_frequency_type = "CONTRACT"` when saving; verify it maps correctly through the existing insert path.

### 2. Fix 5 — irrigation seeds (not a bug, verify only)
- DB check confirms the three services already exist: "Irrigation system winterization and drainage", "Irrigation system spring startup", "Irrigation system operation check" under the "Regular Maintenance" category. The earlier failure was because the tenant was suspended. No code change needed; will re-verify in Playwright once (1) is patched.

### 3. Fixes 1, 3, 7, 10 — retest only
- Fix 1 (inventory inline edit), Fix 3 (contract header edits), Fix 7 (customer list tab order after create), Fix 10 (flat-fee catalog hidden) all failed in the last run only because tenant `Hero dinamo` was suspended and RLS returned empty results. Tenant is now `active`, so a fresh Playwright pass should cover them without code changes. If any actually fail on retest, patch then.

### 4. Verification
- Rerun the authenticated Playwright suite against `test@acme.io`:
  1. Inventory: create item, inline-edit name/qty, save, reload → persists.
  2. Contract new: select "per Contract" — dropdown must offer it and save must succeed.
  3. Contract new: pick "Regular Maintenance" — service checklist hidden, flat fee visible.
  4. Contract detail: edit header (name, dates, notes) → persists.
  5. Customer create → new row visible in list; tab order Properties → Contracts → Service Visits.
  6. Catalog page: irrigation trio present in RO and EN.

### Out of scope
Anything not in the 13-item feedback list; no schema changes.
