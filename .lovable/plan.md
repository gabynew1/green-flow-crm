## Goal
Verify the recent feedback-triage fixes end-to-end against the live preview using the signed-in provider account `test@acme.io` (tenant `Hero dinamo`, which has 0 customers/properties/contracts today).

## Step 1 — Seed minimal test data (via UI, through Playwright)
Rather than SQL inserts (which skip triggers), the seeding script drives the UI so it mirrors real usage:
1. Sign-in state is already injected — navigate straight to `/provider/customers` and create customer **"QA Test Client"** (Company left blank to verify optional-company change).
2. Open the customer, add property **"QA Garden"** with any address.
3. Create a contract on that property: name "QA Weekly", frequency **Per Contract** (new enum), then a second contract "QA Flat" in flat-fee mode.

If any of those UIs fail, the test reports the failure and stops — that itself is a real regression signal.

## Step 2 — Run targeted Playwright checks for each recent fix
One script (`/tmp/browser/qa/run.py`) with distinct steps, screenshotting each assertion. Coverage:

1. **Customer create form (Fix 6)** — confirm no "Contact Person" field, Company marked optional.
2. **Tab order on customer detail (Fix 7)** — assert Properties tab appears before Contracts before Service Visits.
3. **Contract create — no Zone selector, no Unit column (Fix 2)** — open the new-contract page, confirm Zone selector is absent, add-line dialog has no Unit input.
4. **Per Contract frequency (Fix 2)** — assert the frequency dropdown offers "Per Contract".
5. **Flat-fee mode hides catalog (Fix 4)** — toggle flat fee, confirm the per-service checklist disappears.
6. **Contract detail editable header (Fix 3)** — open the seeded contract, confirm name/dates/billing cycle inputs are editable.
7. **Inventory inline edit + no Health column (Fix 1)** — add one inventory item on the property, click pencil, edit name, save, confirm Health column is gone.
8. **Irrigation catalog seeds (Fix 5)** — on contract line add, search "irrigation" and confirm winterization / startup / check appear.

Each step captures a screenshot to `/tmp/browser/qa/screenshots/` and prints pass/fail. I'll then view the screenshots to visually confirm the assertions.

## Step 3 — Report
Consolidated pass/fail table per fix, with screenshot evidence for anything that fails.

## Notes
- No production data touched — everything is created under the test provider's tenant.
- If a seeding step fails, subsequent dependent checks are skipped and reported as blocked (not failed).
- No code changes in this plan; only observation.
