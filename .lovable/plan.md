# Simplify Visits & Scheduling — Review + Improvement Plan

## What makes it complex today (findings)

1. **Three overlapping "task-like" concepts.** `service_orders` (the actual "visit"), `tasks` (generic checklist, some FK'd to a visit), and `action_tasks` (approval workflow). None share naming, FKs, or status vocabulary. Debugging requires knowing that "visit" in the UI = `service_orders` in the DB.
2. **Two parallel "line item" concepts.** `contract_line_items` (what was sold) vs. `service_order_items` (what gets done on a visit), with a partial FK between them and independent `frequency_type` enums that don't match.
3. **Four independent ways to create a visit**, each with its own defaults and validation:
   - Contract activation (`ContractDetail.tsx:152`) — full engine
   - Manual "Generate Visit" button (`ContractDetail.tsx:370+`) — hand-rolled, bypasses engine
   - Ad-hoc dialog (`CreateAdHocVisitDialog.tsx:278`) — its own capacity rules
   - Client feedback "request" (`ClientFeedback.tsx:38`) — inserts with **no `team_id`, no `tenant_id`, no `contract_id`**
4. **Capacity constant disagrees with itself.** Engine allows 5/day (`schedule-engine.ts:4`), ad-hoc dialog blocks at 4/day (`CreateAdHocVisitDialog.tsx:241`). Users see contradictory availability depending on entry point.
5. **7-value visit status enum**, migrated once from 4 values via a lossy `CASE` remap. Client UI only maps 4 of the 7 (`ClientVisitDetail.tsx:13-27`) — unmapped statuses render as raw enum text.
6. **Status label/color maps copy-pasted three times** (`ServiceVisits.tsx`, `VisitDetail.tsx`, `ClientVisitDetail.tsx`) and have already drifted.
7. **Silent failures in the engine.**
   - `findAvailableSlot` returning `null` → visit silently dropped (`schedule-engine.ts:191`).
   - Hardcoded `visits.length >= 500` cap → silent truncation (line 217).
   - Success toast only reports final count, never which target dates were skipped.
8. **Reschedule "conflict check" is post-hoc.** The `UPDATE` runs first, then a warning toast appears — the collision is never actually prevented (`RescheduleVisitButton.tsx:38 → 63`).
9. **Two frequency vocabularies.** Contract-level `WEEK/MONTH` vs. line-item `PER_VISIT/PER_WEEK/PER_MONTH/ONE_TIME`. Nothing enforces they agree.
10. **Two holiday sources + Sunday hardcoded.** `global_holidays` + `tenant_non_workdays`, combined only in the SQL `is_workday()`. Client-side scheduling uses an injected `WorkdayChecker` that could drift from SQL. Engine additionally hardcodes Mon–Sat weekly framing (`schedule-engine.ts:175`), silently excluding Saturday work in some flows.
11. **Naming drift end-to-end.** DB says `service_orders`, UI says "Visit", tasks/action_tasks add "task" — three vocabularies for adjacent concepts.
12. **Cross-cutting mutation paths.** Lifecycle cron and `client_delink_property` bulk-cancel or hard-delete visits as side effects, invisible from scheduling UI code.
13. **Large files.** `VisitDetail.tsx` 822, `ContractDetail.tsx` 762, `TasksPage.tsx` 748, `CreateAdHocVisitDialog.tsx` 640, `ServiceVisits.tsx` 548.

---

## Improvement plan — grouped by impact vs. effort

### Tier A — High CX impact, low risk (do first)

**A1. Single source of truth for visit status.**
Extract `statusColor`, `statusLabels`, and `getVisitScopeStatus` into `src/lib/visit-status.ts`. Delete the three copy-pasted maps. Add a fallback that maps unmapped statuses to a safe generic label + neutral color so clients never see raw `PENDING_APPROVAL` strings.
_Loses:_ nothing.

**A2. Collapse the visit status enum from 7 → 4 (client-visible).**
Keep 4 provider-facing statuses: `Scheduled`, `In Progress`, `Completed`, `Canceled`. Move `PENDING_APPROVAL / APPROVED / SENT_TO_CLIENT` behind a single derived flag `needs_client_action` (boolean, computed). Migrate existing rows: map the 3 approval statuses to `Scheduled` + `needs_client_action=true`.
_Loses:_ granular approval-state visibility in the raw enum (still available via the flag + a dedicated "Awaiting client approval" filter).

**A3. Unify capacity to one constant.**
Move `MAX_VISITS_PER_TEAM_PER_DAY` into `src/lib/scheduling-constants.ts`, import it in both the engine and the ad-hoc dialog. Pick one number (recommend 5 — matches engine) and update UI copy.
_Loses:_ nothing.

**A4. Make reschedule conflicts blocking by default, with an explicit "reschedule anyway" confirm.**
Reorder `RescheduleVisitButton.tsx`: run the conflict query first, show a confirm dialog if collisions exist, then update. Removes the current "already moved — here's a warning" surprise.
_Loses:_ one-click reschedule for the rare intentional double-book (adds one confirm click).

**A5. Kill silent visit drops.**
When `findAvailableSlot` returns `null` or the 500 cap triggers, collect the skipped target dates and return them from `generateSchedule`. `ContractDetail.handleActivate` shows: "Scheduled 22 of 24 visits. 2 skipped: 2026-07-04 (holiday), 2026-08-15 (team full)."
_Loses:_ nothing.

**A6. Consolidate the three "visit list/detail" duplicated status maps.**
Covered by A1 mechanically, but also extract `<VisitStatusBadge />` and `<VisitStatusFilter />` shared components; delete inline JSX in the three pages.
_Loses:_ nothing.

### Tier B — Structural simplification (medium effort, high long-term value)

**B1. Delete the "Manual Generate Visit" button path.**
It's a second visit-insert code path in the same file as activation, hand-rolls period logic, and skips the engine. Replace it with the existing ad-hoc dialog (which is more featureful anyway). One less path to reason about.
_Loses:_ the one-click "generate one more visit for this contract" shortcut. Replaced by ad-hoc dialog pre-filled with the contract's property/team.

**B2. Route the client "request a visit" path through the ad-hoc creation code.**
Currently `ClientFeedback.tsx:38` inserts a `service_orders` row missing `tenant_id`, `team_id`, `contract_id`. Change it to write to a new `visit_requests` table (or reuse `action_tasks` with `type='visit_request'`) and let the provider convert it into a real visit via the normal ad-hoc flow. Eliminates the "orphan visit" class of bug.
_Loses:_ instant appearance of client-requested visits on the schedule (now requires provider triage — arguably a feature, since currently clients can silently pollute the calendar).

**B3. Rename `service_orders` → `visits` in DB.**
One migration: `ALTER TABLE service_orders RENAME TO visits`, update all code references. This is the single biggest daily friction removal for anyone debugging via the DB.
_Loses:_ short-term churn in code review. Long-term: nothing.

**B4. Merge `tasks` into `action_tasks` (or delete `tasks` if unused).**
Audit `tasks` usage. If it's a leftover from an earlier feature, drop it. If it's live, migrate rows into `action_tasks` with `type='generic_task'`. Removes the third "task-like" concept.
_Loses:_ depends on audit. If `tasks` is actively used by a live UI, cost is higher — plan a discovery step first.

**B5. Move capacity enforcement into the DB.**
Add a partial unique constraint or a trigger enforcing `count(*) <= MAX_VISITS_PER_TEAM_PER_DAY` per `(team_id, scheduled_date)` for non-canceled visits. Complements the recent `(contract_id, scheduled_date, team_id)` unique index and closes the race between the ad-hoc dialog and contract activation.
_Loses:_ nothing (assuming A3 picks a single number first).

### Tier C — Nice-to-have (defer unless friction is high)

**C1. Unify the two frequency enums.** Pick one vocabulary (recommend `PER_WEEK` / `PER_MONTH` / `ONE_TIME`) and migrate the other. Long-term cleanup, not user-visible.

**C2. Centralize workday logic.** Have the client hook call the SQL `is_workday()` via RPC instead of reimplementing it in JS. Eliminates drift risk. Slight perf cost (one RPC per scheduling operation).

**C3. Explicit timezone anchoring.** Store visit dates as `date` + `tenant timezone`, format everywhere through a single helper. Only worth doing if you plan to expand outside Romania.

**C4. Split the giant files.** `VisitDetail.tsx` (822) and `ContractDetail.tsx` (762) should each be broken into 3-4 focused components. Purely maintainability.

---

## Recommended sequence

1. **Now:** A1, A3, A4, A5 — all small, all directly reduce user-visible errors and surprises. One PR each.
2. **Next:** A2, A6, B5 — status vocabulary simplification + DB-level capacity guard. Requires a migration and coordinated UI change; ship together.
3. **Then:** B1, B2 — collapse the redundant visit-creation paths. Ship after A2 lands to avoid double-migrating status.
4. **Later:** B3 (rename), B4 (tasks audit), C-tier.

## Trade-offs the user should confirm before I implement

- **A2**: are you OK collapsing the 7-value status enum down to 4 + a `needs_client_action` flag? This is the biggest CX win but is a semi-destructive migration.
- **A4**: block reschedule conflicts by default (extra confirm click) — OK?
- **B1**: remove the "Generate Visit" button on contract detail in favor of the ad-hoc dialog — OK?
- **B2**: client "request a visit" becomes a request that providers accept, not an auto-scheduled visit — OK?

Confirm which of A1–A6, B1–B5 you want in scope, and I'll implement in that order.
