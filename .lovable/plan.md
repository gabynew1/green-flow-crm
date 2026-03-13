

## Plan: Case Management Controls for Offers & Contracts

### Problem
Currently, there's no way to handle rejected contracts or move statuses backward on contracts. If a client rejects a contract, the provider is stuck.

### Database Change
Add `REJECTED` to the `contract_status` enum. The contracts table already has a `rejection_comment` column.

```sql
ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'REJECTED';
```

### File Changes

**1. `ContractDetail.tsx` -- Add revert & rejection handling**
- Add "Revert to Draft" button (Undo2 icon) when status is `SENT_TO_CLIENT`, `SIGNED`, or `REJECTED`
- Show rejection comment if present (same pattern as OfferDetail)
- Make line items editable (add/delete) when status is `DRAFT`
- Add "Recreate from Offer" capability: if contract was generated from an offer (`offer_id` exists) and gets rejected, provider can delete old contract line items, re-copy from offer, and reset to DRAFT

**2. `ClientContractDetail.tsx` -- Add client accept/reject actions**
- When status is `SENT_TO_CLIENT`, show Accept & Reject buttons (same pattern as ClientOfferDetail)
- Accept: update status to `SIGNED`
- Reject: dialog with optional comment, update status to `REJECTED` + `rejection_comment`

**3. `PipelineKanban.tsx` -- Add quick status actions on cards**
- **Offer cards**: Show contextual quick action based on current status:
  - `DRAFT` → "Send" action
  - `SENT_TO_CLIENT` → "Edit" (revert to IN_PROGRESS)
  - `REJECTED` → "Edit" (revert to IN_PROGRESS)
- **Contract cards**: Show contextual quick action:
  - `DRAFT` → "Send" action
  - `SENT_TO_CLIENT` → "Revert" (back to DRAFT)
  - `REJECTED` → "Revert" (back to DRAFT)
- Add `REJECTED` to `statusVariantContract` map as `destructive`
- Include rejected contracts in the Contracts column filter

### Status Flow Summary

```text
OFFER:    DRAFT ↔ IN_PROGRESS ↔ SENT_TO_CLIENT → ACCEPTED → (auto-gen contract)
                                      ↓
                                  REJECTED → revert to IN_PROGRESS → edit → resend

CONTRACT: DRAFT ↔ SENT_TO_CLIENT → SIGNED → ACTIVE → CLOSED
                       ↓
                   REJECTED → revert to DRAFT → edit → resend
```

