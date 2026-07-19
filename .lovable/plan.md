## Goal
On the customer detail Service Visits list, surface what needs attention now instead of ancient completed visits, let overdue visits be dismissed in one click, and give each section its own collapse toggle.

## Changes (frontend only, `src/pages/provider/CustomerDetail.tsx`)

### 1. Group visits into three collapsible sections
Bucket the fetched visits, then render each as a collapsible section (using existing `Collapsible` primitive) with a header showing name + count + chevron:

1. **Overdue · N** — `status ∈ {SCHEDULED, IN_PROGRESS}` and `scheduled_date < today`. Sorted oldest → newest. Red left-border accent + "Overdue" pill on each row. **Default: expanded.**
2. **Upcoming · N** — `status ∈ {SCHEDULED, IN_PROGRESS}` and `scheduled_date >= today`. Sorted soonest → latest. Small "Today" divider above the first row when today's visits exist. **Default: expanded.**
3. **Past · N** — `status ∈ {COMPLETED, CANCELED}`. Sorted newest → oldest. **Default: collapsed.**

All three headers are click-to-toggle. Section is hidden entirely if its bucket is empty (except we show a friendly "No upcoming visits" line when Upcoming is empty but other buckets have items).

### 2. Quick Cancel button for overdue visits
In the Overdue section only, add a ghost `XCircle` icon button next to the existing `RescheduleVisitButton`. Clicking it:

- Opens an AlertDialog: "Cancel this overdue visit? It will be marked CANCELED and removed from the schedule."
- On confirm: `UPDATE service_orders SET status='CANCELED', cancel_reason='Dismissed as overdue' WHERE id=…`, then `load()`.
- Success toast includes an Undo action (~10s) that flips status back to `SCHEDULED`.

No schema or RLS changes — `status` and `cancel_reason` already exist and current policies allow the tenant admin to update.

### 3. Small polish
- Keep the "Rescheduled from …" badge behavior untouched.
- Section open/collapse state is component-local (`useState`), not persisted.

## Out of scope
- Main `/provider/visits` calendar page.
- No DB migrations, no backend changes.
