# GreenGrassCRM — Test Plan

Living document. Always read this before running QA. Update it whenever a
feature ships or a scenario changes.

## How to use
- Pick the sections relevant to the change under test (or run the full suite).
- Drive Playwright against `http://localhost:8080`. Screenshots to `/tmp/browser/qa/`.
- Cross-check UI claims with SQL reads. Report pass/fail per numbered step.

## Test accounts
- Provider: `test@acme.io` / `Green123#Grass` (tenant: Hero dinamo)
- Client:   `test@acme.ro` / `Green123#Grass`
- Super:   `test-public-onboard@example.com`

## Seed policy
Prefer UI-driven creation so we actually test UX. Fall back to SQL only when
the UI path is blocked. Never destructive.

---

## Core E2E scenario (Provider)

1. Login → land on `/provider/customers`.
2. Open "QA Test Client" (create via UI + seed 1 property if missing).
3. **Service Zones** — Settings → Zones. Create 2 zones with descriptions if
   none exist (`Zone Nord - Voluntari`, `Zone Sud - Berceni`). Assign the
   property to a random zone from the property edit UI. Verify description
   persists on reopen.
4. **Create 1-year maintenance contract** — WEEKLY, 12 months, 3–5 random
   catalog services. Activate.
5. **Auto-seeded first visit** — exactly ONE upcoming visit exists after
   activation. Zone chip renders on the row.
6. **Generate next 30 days** — open dialog, confirm preview, submit. Visits
   appear in calendar + list. Overload highlighting sane.
7. **Reschedule** onto a day already at 4+ visits → soft warning toast (no
   block), calendar day orange with team-count tooltip, "Rescheduled from …"
   amber badge with NEW date prominent.
8. **Quick-cancel** an overdue/upcoming visit from customer Visits section →
   10s Undo toast restores it.
9. **Ad-hoc visit** — Create dialog, use service search, custom `HH:MM–HH:MM`
   slot, save → shows on calendar + customer list.
10. **List parity** — same visit renders identically in `/provider/visits` and
    on the customer Visits tab (shared `VisitRow`, same actions).

## Feature coverage

### 11. Billing (Provider + Client)
- Mark 1–2 visits COMPLETED → invoices generated.
- `/provider/billing`: KPIs (collected / outstanding / overdue); mark paid via
  checkbox persists and rebuckets.
- Client `/client/billing`: Overdue / Upcoming (next subscription + ad-hoc) /
  History match provider numbers. Cross-check `invoices`,`invoice_payments`.

### 12. Account details editing
- `/provider/customers/:id/manage`: edit name, contact person, email, phone,
  company → both `profiles` and `customers` updated; header reflects without
  reload.

### 13. Zone description + ZoneChip everywhere
- ZoneChip appears in: `ServiceVisits` row, `VisitDetail`, `ClientVisitDetail`,
  customer `VisitRow`.
- Zone filter dropdown on `/provider/visits` narrows correctly.

### 14. Overdue / Upcoming / Past sections + Undo
- Backdate a visit via SQL → lands in Overdue. Collapsibles work. Quick-`X`
  on overdue. Undo restores within 10s.

### 15. Reschedule prominence & conflict warning
- New date is the large/primary label; amber "Rescheduled from …" shows old
  date. Conflict → warn, don't block.

### 16. Needs-scheduling widget (Dashboard)
- Cancel all upcoming visits for one active contract → contract appears in
  "Needs scheduling soon" on `/provider/dashboard`.

### 17. Self-serve tier switching + trial soft-lock
- Switch tier via UI → entitlements refresh, gated feature toggles.
- Simulate expiry (`trial_ends_at = yesterday`) on throwaway tenant → downgrade
  to Patio, no data loss.

### 18. Language switcher (RO default, EN toggle)
- Globe → EN, reload → persists (reads `profiles.locale`). Service Catalog +
  Inventory categories switch language via translation tables, not just static.

### 19. `per_contract` frequency (regression guard)
- Create contract with `per Contract` frequency → visit count auto-locks to 1;
  only one visit ever seeded.

### 20. Notifications & audit
- Bell shows new entries after contract create + visit cancel.
- `super_admin_audit_logs` / `activity_log` rows exist via SQL.

### 21. Console / network hygiene
- Aggregate console errors + 4xx/5xx across the run into a single Health
  report grouped by page.

## Report format
- Feature coverage matrix: feature → step → pass/fail/screenshot.
- Bugs: reproducible defects with steps + evidence.
- UX friction: top 5 ranked with one-line fix each.

## Maintenance
- When a feature ships or changes, add or update its section here in the
  same commit.
- When a bug is fixed, add a regression step referencing it.

## Regression log
- **2026-07-20 QA run** → `TEST_RUN_2026-07-20.md`.
  - B1: `/provider/billing` invoice list embed on `customers` — add a
    "load billing without error toast" step once fixed.
  - B2: Zone `description` column + textarea missing — re-run §3/§13 after
    the feature actually ships.
  - B3: `get_customer_email_history` 403 for PROVIDER_ADMIN — add an
    "open customer, expect emails list without 403" step.
  - B4: Localize sidebar labels — add an RO/EN diff check on nav.
  - B5: Customer detail is sections, not tabs — decide spec vs code and
    update §11 accordingly.