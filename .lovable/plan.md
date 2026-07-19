# Stop automatic visit duplication on contract activation

## Problem (confirmed)
For contract `9b0d…184`, the DB shows two complete sets of visits generated ~10 seconds apart at activation time. Every scheduled date already has a hidden twin, which is what surfaced during rescheduling. The manual-reschedule fix I just shipped does **not** address this — it only warns when a user moves a visit onto an occupied slot.

The duplication happens server-side during contract activation / visit generation, so the fix belongs there.

## Investigation needed before coding (Step 0)
I need to confirm the exact trigger path before writing the fix. Candidates to inspect:
- `schedule-engine.ts` (visit generation entry point)
- Any Edge Function or DB trigger that fires on `contracts.status` transition to `ACTIVE`
- `ContractDetail.tsx` activation handler (possible double-invocation from the client)
- Any cron/queue worker that could re-run generation for the same contract

Deliverable of Step 0: identify whether the second run comes from (a) client double-click / double-request, (b) trigger + explicit call both firing, or (c) retry logic without idempotency.

## Fix strategy (applied based on Step 0 findings)

1. **Idempotency guard at generation time**
   Before inserting generated visits for a contract, check whether visits already exist for that `contract_id` in the target window. If yes, skip generation and log a warning to `activity_log` instead of inserting again.

2. **DB-level safety net**
   Add a partial unique index to make a true duplicate physically impossible:
   ```
   UNIQUE (contract_id, scheduled_date, team_id) WHERE status <> 'CANCELLED'
   ```
   (Exact columns finalized after Step 0 — may include service_catalog_id if a contract legitimately has multiple visits same day.)

3. **Activation handler hardening**
   - Disable the "Activate" button while the request is in flight.
   - Make the activation RPC/Edge Function idempotent: if contract is already `ACTIVE`, return success without regenerating visits.

4. **One-time cleanup of existing duplicates**
   Backfill script: for each `(contract_id, scheduled_date, team_id)` group with >1 non-cancelled visit, keep the earliest `created_at` and soft-cancel the rest (status = `CANCELLED`, note = "duplicate cleanup"). Dry-run report first, then execute after review.

## Out of scope
- Manual reschedule flow (already fixed).
- Changing how flat-fee pricing displays on visits.

## Technical notes
- New unique index must be created `CONCURRENTLY` and only after cleanup, otherwise creation will fail on existing duplicates.
- Cleanup must run as a migration with a printed count so we can audit affected contracts.
- If Step 0 reveals a DB trigger firing generation, prefer removing the redundant call site over adding more guards.
