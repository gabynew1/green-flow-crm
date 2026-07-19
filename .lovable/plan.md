# Simplify scheduling: auto-next-visit + one manual horizon + soft capacity warnings

**Shape.** Contract activation creates exactly **one** visit (the next one). Everything after that is a single explicit action: **"Generate next 30 days"** on the contract detail. Team capacity becomes a **soft warning only** — never blocks — surfaced in one place: **orange days in the calendar**. A dashboard widget catches anything about to fall through the cracks.

**Why this shape.** Every active contract always has a future appointment (books the follow-up before the current workflow ends). One horizon button beats a menu of four. One warning surface beats calendar + action tasks + inbox + retries. Providers keep control; the system stops silently dropping work.

---

## 1. Activation creates only the next visit

- Rip out bulk generation on contract activation.
- On activation, compute the **first** recurrence date from `start_date` + recurrence rule and create exactly one visit for it (assigning the contract's default team, first free time slot on that day, no capacity block).
- Contract goes ACTIVE with one visit on the books. Nothing else pre-created.

## 2. One manual action: `Generate next 30 days`

Single button on `ContractDetail.tsx` (no menu, no horizon picker):

```text
[ Generate next 30 days ]
```

Opens a compact preview dialog:

```text
Generating for: Ionescu · Front Yard · Weekly mowing
Window: Jul 20 – Aug 19 (30 days)
Recurrence: every Tuesday · Team A

  Tue Jul 21   Team A   09:00              [OK]
  Tue Jul 28   Team A   09:00              [OK]
  Tue Aug 04   Team A   09:00   ⚠ heavy day
  Tue Aug 11   Team A   09:00              [OK]

  [Cancel]   [Create 4 visits]
```

- Walks recurrence from `max(last_scheduled_date + 1, today)` up to `today + 30d`.
- Skips dates already covered by an existing visit for that contract (idempotent — safe to press twice).
- Flags rows as "heavy day" (soft), never blocks, never silently drops.
- On commit, inserts all rows in one RPC using the existing `service_orders_contract_date_team_unique` guard for safety.

Deferred (out of v1): 7/90-day / next-only horizons, per-row "pick different day" edits.

## 3. Capacity: warn, don't block

- Replace `MAX_VISITS_PER_TEAM_PER_DAY` (hard cap) with `TEAM_DAY_WARNING_THRESHOLD = 4` (advisory).
- Remove every branch that blocks or drops a visit at the cap:
  - `RescheduleVisitButton` — no more block-with-confirm; just reschedule and show a yellow toast when the destination team-day is heavy ("Team A now has 5 visits on Tue Jul 21").
  - `schedule-engine` — no more `skipped[]` return path; every candidate becomes a visit.
- Any team can be assigned any number of visits on any day. Threshold is purely for the warning surface below.

## 4. Overload visibility: calendar only (v1)

One surface, low noise:

- In `ServiceVisits.tsx` calendar (Day / Week / Month), any day where **any team** exceeds `TEAM_DAY_WARNING_THRESHOLD` renders in **bright orange** (background tint + orange dot next to the date + orange left border in week/day views).
- Tooltip on hover: `Team A: 5 visits · Team B: 2 visits`.
- Preview dialog (§2) reuses the same threshold to flag "heavy day" rows.

Deferred (out of v1): auto-created action tasks for overloaded team-days, notifications, in-inbox surfacing. Explicitly avoiding alert fatigue.

## 5. Safety net: `Needs scheduling soon` dashboard widget

On `/provider/dashboard`:

- Card titled **"Needs scheduling soon"**.
- Lists active contracts that have **no visit** scheduled in the next 7 days.
- Each row: property · contract · next expected date (per recurrence) · `[Generate next 30 days]` (same action as contract detail).
- Empty state: "All contracts have upcoming visits" ✅.

This is the single mechanism that prevents "forgotten contract" regressions now that bulk generation is gone.

## 6. Explicit deletions

- Bulk visit generation on contract activation.
- `MAX_VISITS_PER_TEAM_PER_DAY` hard cap and every block/confirm/skip branch that referenced it.
- The `skipped[]` return from `schedule-engine` and any callers that surfaced it.
- Planned `skipped_visits` table + retry RPC + skipped-visits inbox (never shipping).
- Any client-side idempotency guard tied to the old activation button (superseded by the unique index + one-visit activation).

Keeps: `service_orders_contract_date_team_unique` index (safety net on the horizon commit RPC).

## 7. Existing contracts

- Contracts already ACTIVE with pre-generated future visits: left alone.
- Contracts activated after ship: follow the one-visit-then-horizon flow.
- No backfill needed for calendar orange — it's a pure live query over `service_orders`.

---

## Technical details

**Files touched**

- `supabase/migrations/<new>.sql`
  - `fn_activate_contract_next_visit(contract_id)` — creates the single next visit (idempotent).
  - `fn_generate_next_30_days(contract_id)` — walks recurrence, inserts missing rows, respects the existing unique index, returns per-row `{date, team_id, is_heavy_day}` for the preview.
  - Remove any activation-time bulk-generation trigger/RPC.
- `src/lib/scheduling-constants.ts`
  - Drop `MAX_VISITS_PER_TEAM_PER_DAY`.
  - Add `TEAM_DAY_WARNING_THRESHOLD = 4`.
- `src/lib/schedule-engine.ts`
  - Remove hard-cap skip logic and the `skipped[]` return; slot picking continues past the threshold.
- `src/pages/provider/ContractDetail.tsx`
  - Replace old activation-generation UI with the single `[Generate next 30 days]` button + preview dialog.
- `src/components/provider/GenerateNext30Dialog.tsx` (new)
  - Fetches preview from the RPC, renders rows with the heavy-day flag, commits on confirm.
- `src/components/provider/RescheduleVisitButton.tsx`
  - Drop block-with-confirm; keep the toast; add heavy-day wording when the destination crosses threshold.
- `src/pages/provider/ServiceVisits.tsx`
  - Add per-day team counts across visible range → orange highlight + tooltip.
- `src/hooks/useOverloadedTeamDays.ts` (new)
  - Feeds calendar highlighting and the preview dialog.
- `src/hooks/useContractsNeedingScheduling.ts` (new)
  - Powers the dashboard widget.
- `src/pages/provider/Dashboard.tsx`
  - Add "Needs scheduling soon" card.
- `mem://features/visits-simplification.md`
  - Replace auto-scheduler + hard-cap rules with: activation = 1 visit · manual = 30-day horizon · capacity = soft warning · single overload surface = calendar orange.

**Non-goals for v1** (documented, deliberately deferred)

- Multiple horizon options (7 / 90 / next-only).
- Auto-created overload action tasks.
- Overload notifications / email nudges.
- Per-row "pick different day" edits in the preview.
- Cross-team reshuffle suggestions.
- Zone-aware conflict wording in the reschedule toast.

**Rollout order**

1. Migration (RPCs + remove activation-time bulk generation).
2. Constants + engine cleanup + deploy edge functions.
3. Contract detail button + preview dialog + reschedule simplification.
4. Calendar overload highlighting + dashboard widget.
5. Verify end-to-end: activate contract → exactly one visit created → press `Generate next 30 days` → preview shows heavy days in orange → commit → calendar highlights those days → reschedule a visit off a heavy day → calendar returns to normal → dashboard widget shows empty state once every active contract has an upcoming visit.
