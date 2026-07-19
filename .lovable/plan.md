## Problem

When rescheduling a visit from Jun 24 → Jun 20 in `providers/visits`, the visit appears to duplicate instead of moving.

## Diagnosis (unconfirmed — needs live repro)

`RescheduleVisitButton` runs a single `UPDATE service_orders SET scheduled_date = ?` then reloads. No INSERT path, no DB trigger on `service_orders` regenerates visits — so a real duplicate row is unlikely.

Two plausible causes for the *appearance* of a duplicate:

1. **Timezone drift in the date picker.** `new Date("2026-06-24")` parses as UTC midnight; local rendering can shift the day by ±1 depending on the timezone.
2. **A visit already exists on the target date** for the same property/team. Moving Jun 24 → Jun 20 leaves both the pre-existing Jun 20 visit and the moved one on Jun 20, which reads as a "new" visit.

## Plan

1. **Verify against the real data** with a read-only query on `service_orders` around Jun 20–24 for the affected property to confirm whether a second row was inserted or an existing row was already there.

2. **Fix timezone handling** in both reschedule components (`src/components/provider/RescheduleVisitButton.tsx` and the inline copy in `src/pages/provider/CustomerDetail.tsx`):
   - Parse `currentDate` with `parseISO` from `date-fns` instead of `new Date(...)`.
   - Keep `format(date, "yyyy-MM-dd")` on save.

3. **Consolidate** the duplicated `RescheduleVisitButton` in `CustomerDetail.tsx` — delete the inline copy, import the shared component.

4. **Slot-conflict notice (allow, don't block)** — per your instruction:
   - Before saving, query `service_orders` for other visits on the same `property_id` + `team_id` + target `scheduled_date` (exclude current visit, exclude `CANCELED`).
   - **Always save the reschedule**, then surface the result:
     - No conflict → `toast.success("Vizită reprogramată pe {date}")`.
     - Conflict found → `toast.warning("Vizită reprogramată pe {date}. Atenție: mai există {N} vizită(e) programate pentru echipa {team} în acea zi.")` with the list of conflicting property/period labels in the description.
   - Never prevent the save; the toast is informational only.

5. **Cache invalidation**: after the update, call `queryClient.invalidateQueries({ queryKey: ["zone-date-map"] })` in addition to `onRescheduled()` so the calendar's occupancy heatmap refreshes.

6. **Test in preview (Playwright)**:
   - Log in as the provider, open `/provider/visits`, pick a visit, reschedule it onto a date that already has a visit for the same team.
   - Assert: the row moves in the DB (single UPDATE, no INSERT), the calendar shows both visits on the target day, and a warning toast appears naming the conflict.
   - Repeat with a free date to confirm the success toast path.
   - Screenshot both outcomes for verification.

## Technical notes

- Files touched: `src/components/provider/RescheduleVisitButton.tsx`, `src/pages/provider/CustomerDetail.tsx`. No DB migration, no edge functions.
- Conflict query is scoped by tenant via existing RLS.
- `sonner` `toast.warning(...)` is used for the conflict notice (already the project's toast library).
- Playwright test lives under `/tmp/browser/reschedule-conflict/` and runs against `http://localhost:8080` with the injected Supabase session.
