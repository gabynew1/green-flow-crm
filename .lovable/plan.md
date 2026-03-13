

## Plan: Accept Offer on Behalf of Client + Auto-Generate Contract

### Summary
Add an "Accept on Behalf" button on the provider's Offer Detail page when status is `SENT_TO_CLIENT`. On click, show a confirmation dialog informing the provider that the client will be notified the offer was agreed offline. On confirm, set offer status to `ACCEPTED` and auto-generate a draft contract (same logic as the existing `generateContract` function). Also wire up the existing client-side acceptance to trigger the same contract generation.

### No DB Changes Needed
The `ACCEPTED` status and contract generation logic already exist.

### File Changes

| File | Change |
|---|---|
| `OfferDetail.tsx` | 1. Add an "Accept on Behalf of Client" button visible when `status === "SENT_TO_CLIENT"`. Wrapped in an `AlertDialog` with message: *"This will mark the offer as accepted on the client's behalf. The client will be informed that the offer was agreed offline."* On confirm: set status to `ACCEPTED`, then call `generateContract()`. 2. Modify `generateContract` so it also works when called after acceptance (currently gated behind `ACCEPTED` status button — after accept-on-behalf, the contract is generated immediately without needing a second click). 3. Remove the standalone "Generate Contract" button since contract creation now happens automatically upon acceptance. |
| `ClientOfferDetail.tsx` | After the client accepts an offer (status changes to `ACCEPTED`), also auto-generate a draft contract using the same pattern: insert into `contracts` + copy `offer_line_items` → `contract_line_items`. |

### Flow After Changes
1. Provider sends offer → status = `SENT_TO_CLIENT`
2. Either:
   - **Provider** clicks "Accept on Behalf" → confirmation dialog → status = `ACCEPTED` → draft contract auto-created
   - **Client** accepts from their portal → status = `ACCEPTED` → draft contract auto-created
3. Contract card appears in Kanban under Contracts column with `DRAFT` status

