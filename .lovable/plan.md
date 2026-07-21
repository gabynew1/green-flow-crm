## Fix duplicate buttons at the bottom of the Visit page

In `src/pages/provider/VisitDetail.tsx` (lines 770-806), there is a legacy footer row that renders both a "Save Changes" button and a "Delete Visit" button. This is why they still show even though the top action row already handles Delete for canceled visits.

### Changes

1. **Move "Save Changes" up**, next to the top action row (the same header area that hosts Check-In / Reschedule / Cancel Visit / Complete & Send Report). It stays visible only when not COMPLETED — same rule as today. Placing it there keeps the primary "save the form" action close to the fields users just edited (notes, summary, edit-mode date pickers).

2. **Remove the standalone "Delete Visit" button from the footer.** Delete is now exclusively a CANCELED-state action inside the shared `VisitActionRow` (already wired in the top action row). Providers who want to delete an active visit must Cancel first, then Delete — this matches the state machine we agreed on and eliminates the confusing "delete a scheduled visit outright" path.

3. **Delete the now-empty footer div** (lines 770-806) so nothing renders below the Notes card.

### Result

- Header action row: `[Status Badge]` · Check-In · Reschedule · Complete & Send · Cancel Visit · **Save Changes**
- When CANCELED, header action row: Rebook · Delete Visit · Save Changes (if still editable)
- No buttons below the Notes card.
