

## Plan: Allow closing visits with a past performed date (up to 30 days back)

### What changes

**File: `src/pages/provider/VisitDetail.tsx`**

1. **Add a date picker to the "Complete" confirmation dialog** — between the summary textarea and the billing info, add a date picker labeled "Performed date" that defaults to today but allows selecting any date from up to 30 days ago through today. Future dates are disabled.

2. **Update `markAsDone`** — use the selected performed date instead of always defaulting to today.

3. **Update `changeStatus`** — when status changes to COMPLETED via the dropdown, also use today (current behavior is fine as fallback since the main flow is via the dialog).

4. **Update dialog description text** — change "set today as the performed date" to "set the performed date" to reflect the new flexibility.

### Technical details

- Use the existing `Calendar` + `Popover` components (already in the project) for the date picker.
- Disable dates older than 30 days (`subDays(new Date(), 30)`) and future dates.
- Store selection in a new local state `completionDate` initialized to `new Date()`.
- Pass `format(completionDate, "yyyy-MM-dd")` to the `performed_date` field in `markAsDone`.

No database changes needed — `performed_date` already accepts any date.

