

## Plan: Add Calendar Week View + View Toggle to Service Visits

### What
Add a calendar-style week view (default) alongside the existing list view, with a toggle at the top of the page to switch between them.

### Changes

**Edit: `src/pages/provider/ServiceVisits.tsx`**

1. **View toggle** — Add `viewMode` state defaulting to `"calendar"`. Render a toggle group (Calendar / List icons) in the header row next to "Create Visit" button.

2. **Calendar view** (new, default):
   - **Day navigation strip**: Shows selected date (defaults to today) with left/right arrows to move day-by-day and a "Today" button to reset. Displays visits for that day as cards below.
   - **Week grid**: 7-column grid (Mon–Sun) for the week containing `selectedDate`. Each column shows visit blocks color-coded by status. Clicking a visit links to its detail page. Today's column is highlighted. Left/right arrows shift the week by 7 days.
   - Uses `date-fns` for date math (`startOfWeek`, `addDays`, `format`, `isSameDay`, `isToday`).

3. **List view** — Keep the existing search + status filter + card list exactly as-is, shown when `viewMode === "list"`.

4. **Shared**: Both views use the same `orders` data, search/filter bar stays visible in list view only. The Create Visit button and dialog remain in both views.

### Files
- **Edit**: `src/pages/provider/ServiceVisits.tsx`

