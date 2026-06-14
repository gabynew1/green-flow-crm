## Calendar UX Improvements — `src/pages/provider/ServiceVisits.tsx`

Presentation-only changes to the provider Visits calendar. No data, no business logic, no other files touched.

### 1. Month becomes the default view
- Change initial state: `useState<"day"|"week"|"month">("month")`.

### 2. "Back to month" affordance on drill-down
- When the user clicks a date cell in month view, we already jump to day view. Track this transition with a `cameFromMonth` boolean.
- While in day view AND `cameFromMonth` is true, render a prominent secondary button above the date strip:
  - `← Back to month` — sets view back to `month` and clears the flag.
- The flag clears automatically when the user changes view via the dropdown or edge arrows.

### 3. Unified date-navigation strip (replaces the per-view strips)

```text
[ « ]   [ ‹ ]   Monday, June 16, 2025   [ › ]   [ » ]    [Today]
 edge    tight          date label        tight   edge
```

- **Tight inner arrows (`‹` / `›`, small icon button, `h-8 w-8`)** sit immediately next to the date label (`gap-1`). They step the period by 1 unit of the **current view**:
  - day view → ±1 day
  - week view → ±1 week
  - month view → ±1 month (e.g. June → `›` → July)

- **Large edge arrows (`«` / `»`, `h-11 w-11`, `ChevronsLeft` / `ChevronsRight` from lucide-react)** anchored to the far left/right. They cycle the **view type** along the axis `month ↔ week ↔ day`:
  - `«` zooms out: day → week → month. Disabled on month.
  - `»` zooms in: month → week → day. Disabled on day.
  - No wrap.

- The label adapts to the view:
  - day → `EEEE, MMMM d, yyyy`
  - week → `MMM d – MMM d, yyyy` (current week range)
  - month → `MMMM yyyy`

- The standalone `Today` button stays on the right of the strip when `selectedDate` is not today.
- Slot-occupancy badges under the date label remain in day view only (as today).

- This single strip is rendered for all three views, replacing the current "Previous Week / Next Week" and "Previous Month / Next Month" strips inside the week and month panels.

### Out of scope
- No changes to data fetching, filters, search, ad-hoc create dialog, visit cards, list view, slot capacity logic, or styling tokens beyond adding the two new chevron icons.
