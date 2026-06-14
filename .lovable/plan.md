## Provider → Service Visits page (`src/pages/provider/ServiceVisits.tsx`)

1. **View granularity dropdown (Day / Week / Month)**
   - Add a `<Select>` next to the existing Calendar/List toggle with options: Day, Week, Month.
   - State: `calendarView: "day" | "week" | "month"` (default `week` to preserve current behavior).
   - Day view: current "selected day + week strip" layout, but show only the day section (hide the 7-day grid).
   - Week view: current behavior (day strip + 7-day grid).
   - Month view: new 6-row month grid built with `date-fns` (`startOfMonth`, `endOfMonth`, `startOfWeek`, `eachDayOfInterval`), with prev/next month navigation. Each cell shows up to 2 visit chips colored by team + "+N more"; clicking a day switches to Day view on that date.
   - Only shown when `viewMode === "calendar"` (the List view is unaffected).

2. **Property filter**
   - Add a searchable property `<Select>` (or `Combobox` using existing `Command` primitives) next to the Team filter. Populated from the same `orders` (unique `properties.id`/`name`) or a dedicated `properties` fetch scoped by `tenant_id`.
   - State: `propertyFilter: string` ("ALL" default). Applied alongside `teamFilter` for both calendar and list views (`teamFiltered` becomes `teamAndPropertyFiltered`).

## Create Visit dialog (`src/components/provider/CreateAdHocVisitDialog.tsx`)

3. **Time slot: preset OR custom HH:MM – HH:MM**
   - Add a small toggle (segmented control / Tabs) "Preset / Custom".
   - Preset: existing 5 two-hour slots dropdown (unchanged).
   - Custom: two `<Input type="time">` for start and end. Validate `end > start`. On submit, write `scheduled_start_time`/`scheduled_end_time` directly from the custom values; `period_label` uses `${start}–${end}` instead of the preset label.
   - State: `slotMode: "preset" | "custom"`, `customStart`, `customEnd`.

4. **Services search**
   - Inside the services panel (after the category Select, above the checkbox list), add a small `<Input>` with a search icon that filters `filteredServices` by `name` (case-insensitive `includes`).
   - State: `serviceSearch: string`. No backend change.

## Out of scope
- No DB/schema changes; `scheduled_start_time`/`end_time` columns already exist.
- No changes to capacity logic, contracts, emails, or the client-facing visits page.
- No i18n string additions beyond the new labels (English now; Romanian can be added with the existing i18n setup later).
