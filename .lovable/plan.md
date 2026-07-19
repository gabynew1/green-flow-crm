## Goal

One shared visit-row component used everywhere a visit is listed, so any change (quick-cancel button, zone chip, rescheduled badge, status colors, etc.) shows up in every location automatically.

## Current state (verified)

Two separate implementations render visit rows today:

- **`src/pages/provider/CustomerDetail.tsx`** — has its own `VisitRow` + `VisitSection` + `VisitSections` (overdue / upcoming / past grouping, quick-cancel on overdue, rescheduled-from badge, zone chip).
- **`src/pages/provider/ServiceVisits.tsx`** — inline JSX in two places (calendar day/week list around L362, list view around L500+). Has team-color left border, time-slot, Auto/Manual badge, zone chip, reschedule button, but **no quick-cancel and no rescheduled-from badge**.

That divergence is why "Service Visits" tab and the customer's visit list look and behave differently.

## Plan

### 1. Extract shared components

Create `src/components/provider/visits/VisitRow.tsx` with all features unified:

- Team-color left border (opt-in via `showTeamColor`)
- Team color dot (opt-in)
- Property name · customer name · time slot · period label
- Auto / Manual badge
- Zone chip
- Rescheduled-from badge (auto-detected from `period_label`)
- Overdue badge (when `kind="overdue"`)
- Reschedule button (active visits)
- Quick-cancel button with Undo toast (overdue OR opt-in via `allowQuickCancel`)
- Status badge using `visitStatusColor` / `visitStatusLabel`
- Row click → `/provider/visits/:id`

Props:
```
{ visit, kind?: "overdue"|"upcoming"|"past"|"neutral",
  showTeamColor?, showCustomerName?, showAutoManual?, allowQuickCancel?,
  onChanged: () => void }
```

Also extract `VisitSections` (overdue / upcoming / past grouping, Today divider, collapsible past) into `src/components/provider/visits/VisitSections.tsx` so it can be reused later if we want the same grouping on the Service Visits list view.

### 2. Wire it in

- **`CustomerDetail.tsx`** — delete the local `VisitRow`/`VisitSection`/`VisitSections`, import the shared ones. Behavior unchanged.
- **`ServiceVisits.tsx`** — replace the inline calendar-day cards and the list-view rows with `<VisitRow …>`. This gives Service Visits the quick-cancel button and rescheduled-from badge for free, and keeps team color + time slot + Auto/Manual by passing the right props.

### 3. Verify

Confirm both pages render identical row markup and that:
- Overdue rows show quick-cancel in both locations.
- Reschedule / cancel / status changes refresh the list via `onChanged`.
- Zone chip, team color, and time slot still appear in the Service Visits calendar day view.

## Out of scope

- No DB / RLS changes.
- No changes to visit detail page or client-side visit pages (they don't render lists of rows).
- Calendar month/week grid cells stay as-is; only the "day's visits" list under the calendar is unified.
