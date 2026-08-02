## What's happening

On the customer page (`/provider/customers/...`), the contract list only offers a subset of actions. For a contract in "Sent to client" state (e.g. *Mentenanta _test 2*, currently `SENT_TO_CLIENT`) the row shows the text "Awaiting client" and nothing else — no way to mark it signed, revert it, or cancel it.

Current buttons in the customer contract list:
- Draft → Send
- Sent to client → (text only, no actions)
- Signed → Activate
- Active → Close
- Closed → Renew

The contract detail page has more (Mark Signed, Revert to Draft), but there is no Cancel anywhere for a contract that is not yet Active — a draft or sent contract can only sit there or be reverted.

## The fix

### 1. Complete the action set in the customer contract list

For each contract row, show the actions that make sense for its state:

| Status | Actions |
|---|---|
| Draft | Send to client, Cancel |
| Sent to client | Mark Signed, Revert to Draft, Cancel |
| Signed | Activate, Revert to Draft, Cancel |
| Active | Close |
| Rejected | Revert to Draft |
| Closed / Cancelled | Renew |

To keep the row from getting crowded, the primary action (Send / Mark Signed / Activate / Close / Renew) stays a visible button; the secondary ones (Revert to Draft, Cancel) move into a small "…" dropdown menu at the end of the row.

Marking as signed uses the same status update the contract page uses, so behaviour stays identical between the two screens.

### 2. Add a real Cancel for not-yet-active contracts

Cancelling a draft/sent/signed contract sets its status to `REJECTED` (the existing "cancelled before it started" state) with a short reason captured in the existing rejection comment field, shown behind a confirmation dialog so it can't be hit by accident. It does not touch visits or invoices, because none exist yet at those stages. Active contracts keep using the existing Close flow (reason + audit + cancelling future visits) — unchanged.

The same Cancel action is also added to the contract detail page header for Draft / Sent to client / Signed, so both screens agree.

### 3. Revert to Draft from the customer list

Reuses the existing status update to `DRAFT` and clears any rejection comment, matching what the contract page already does.

## Technical notes

- `src/pages/provider/CustomerDetail.tsx`: extend `updateContractStatus` to also clear `rejection_comment` when moving to `DRAFT`, add a `cancelContract(id, reason)` helper writing `status: "REJECTED"` + `rejection_comment`, and replace the inline action block (lines ~397-419) with a status-driven action group plus a `DropdownMenu` for secondary actions and an `AlertDialog` for cancel confirmation.
- `src/pages/provider/ContractDetail.tsx`: add a Cancel button (with the same confirm dialog) for `DRAFT`, `SENT_TO_CLIENT`, `SIGNED`; `canRevert` already covers Revert to Draft.
- No database or RLS changes: `contract_status` already includes `REJECTED`, and providers can already update their own contracts (the existing edit/send actions work).
- Status label/colour maps in both files already handle `REJECTED`.
