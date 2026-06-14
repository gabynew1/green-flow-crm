Plan:

1. Remove the nested interactive control problem
   - Stop rendering `RescheduleVisitButton` inside a React Router `Link`.
   - Keep the visit row/card visually clickable, but make only the non-control area navigate to the service visit page.
   - Leave the reschedule button in its own action area with enough hit space so clicks cannot trigger row navigation.

2. Keep the popover interaction stable
   - Preserve the controlled `open` state in `RescheduleVisitButton`.
   - Use event stopping only where needed, without `preventDefault` on the popover trigger so Radix can open the popover.
   - Ensure the calendar wrapper keeps `pointer-events-auto`.

3. Confirm save behavior
   - Select a new date for an active visit.
   - Confirm `scheduled_date` is updated on `service_orders`.
   - Confirm the list refreshes after saving and the toast appears.

4. Re-test navigation behavior
   - Clicking the visit content should still open the full service visit page.
   - Clicking the small calendar button should open the calendar popover instead of navigating.
   - Clicking Cancel, OK, or a date inside the popover should not navigate away.