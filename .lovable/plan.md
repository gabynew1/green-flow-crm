## Goal

Show providers how much of each contracted service they have used vs. what the contract allows, directly on the visit checklist — and make creating a visit a single, simple step.

---

## Part 0 — Fix the missing contract link (prerequisite)

Today, service lines on a visit are saved without a reference back to the contract line they came from (`contract_line_item_id` is empty), so any counter would always read 0.

- Write `contract_line_item_id` whenever a service line is created from a contract (visit generation, activation seeding, "Generate next 30 days", manual add on the visit page).
- One-off backfill migration: match existing visit service lines to their contract line by contract + service (and custom name where present). Unmatched lines stay ad-hoc.

## Part 1 — Allocation counter on visit service lines

New helper `getContractLifetimeUsage(contractId)`:

- **allocated** = occurrence limit × number of whole periods in the contract term.
  - PER_WEEK → whole weeks, PER_MONTH → whole months, PER_YEAR → whole years. Partial periods are floored (no allowance for a partial period).
  - ONE_TIME / PER_CONTRACT → the limit as-is (1 when empty).
  - Open-ended contract (no end date) → term runs start → today, minimum 1 period; the counter reads as a running total.
  - PER_VISIT with no limit (legacy lines) → **no total**, show "3 delivered" only.
- **consumed** = delivered (checked) service lines across the whole contract term, counting scheduled and in-progress visits too, so a provider can't quietly overbook past the allowance. Canceled visits are excluded.

Existing per-period scope logic (In Scope / Extra badge) stays exactly as-is.

**Visit detail (provider)**
- Counter reads e.g. `1/2 this month · 20 | 24 total`; badge unchanged.
- Legacy unlimited lines read e.g. `20 delivered`.
- Contract services sorted by allocation descending (unlimited last), then by name, so the most frequent tasks sit at the top of the checklist.

**Client visit detail** — same counter, read-only.

## Part 2 — Required Total Contract Allowance on contract lines

In contract create/edit (and the offer → contract path):

- Each service line gets a required **Total contract allowance** field — "no limit" is no longer allowed.
- Default auto-calculated from contract cadence and term (6-month contract, 2 visits/month → 12). The provider can type any other number.
- Saved so the lifetime allocation equals exactly the typed number (stored as a per-contract total).
- Existing contracts are untouched; they keep the "delivered only" counter until edited.

## Part 3 — Simpler Create Visit

In the create-visit dialog:

- The service **category** dropdown becomes the only input. Multiple categories allowed as removable chips.
- Search box, per-service checkbox list and the long "Selected services" list are removed.
- Picking a category adds only the services in that category that are part of the active contract — never all catalog services.
- Compact summary line instead of a list: *"Regular Maintenance — 3 contract services will be added"*.
- Visits with no contract are created empty; the provider adds services on the visit page.
- Validation changes from "at least one service" to "at least one category".

---

### Technical notes

- One migration: backfill `contract_line_item_id` on existing visit service lines (no new tables/columns).
- Counting stays tenant-scoped via existing row-level security on visits and visit service lines.
- One extra query per visit load, reusing the existing consumption fetch pattern.
