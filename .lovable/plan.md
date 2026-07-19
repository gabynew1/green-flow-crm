## Goal

Align existing tenant/client data with the new "simple scheduling" model so live accounts behave like fresh ones: exactly one seeded next visit per active contract, no pre-generated backlogs, overloaded days visible in orange, and legacy statuses cleaned up.

## Current state (measured)

- **148 future SCHEDULED visits across 12 contracts** were bulk-generated under the old auto-scheduler. One contract has 16+ pre-booked visits, ten have 6–15.
- **2 ACTIVE contracts have no future visit** at all — they would silently stay empty under the new "seed one on activation" rule since activation already happened.
- **8 team-days are already over the soft warning threshold** (>4 visits). These are fine to keep (warnings only), but worth surfacing.
- Visit statuses are already normalized to the collapsed set (`SCHEDULED / COMPLETED / CANCELED`), so no enum shim needed.

## Backfill plan

### 1. Trim the pre-generated backlog (data migration)
For every ACTIVE contract, keep only the earliest future `SCHEDULED` visit per contract; CANCEL the rest with `notes` appended `"[auto-trimmed on migration to simple scheduling]"`. Rationale: matches the new rule "on activation, only next visit exists; the rest come from Generate next 30 days on demand." Does not touch COMPLETED, IN_PROGRESS, or past visits. Does not delete — cancels, so history and audit trail are preserved and providers can see what was trimmed.

Safety rails:
- Scope strictly to `status='SCHEDULED' AND scheduled_date > today` AND contract is ACTIVE.
- Skip ad-hoc visits (`contract_id IS NULL`).
- Log affected count per tenant into `activity_log` so admins can review.

### 2. Seed missing next visits
For the 2 ACTIVE contracts with no future visit, insert exactly one SCHEDULED visit using the contract's recurrence (next valid workday from today, first available slot on the assigned team, respects global + tenant non-workdays). Reuses the same seeding logic already used by the new `handleActivate`.

If a contract lacks a team assignment, skip it and add a row to the tenant's "Needs scheduling soon" widget instead of guessing.

### 3. Leave overloaded days alone
The 8 overloaded team-days stay as-is; the calendar will highlight them orange automatically once the UI change is live. No data change needed — this validates the new soft-warning behavior against real data.

### 4. Announce to providers
Add a one-time `user_notifications` entry per `PROVIDER_ADMIN` on affected tenants:
> "We simplified scheduling. Extra pre-generated visits on N contract(s) were canceled and only your next visit was kept. Use 'Generate next 30 days' on each contract when you're ready to plan further."

Links to `/provider/contracts`.

## Technical section

- **Migration file**: one SQL migration performs steps 1, 2, 4 in a transaction.
  - Step 1: `UPDATE service_orders SET status='CANCELED', notes = coalesce(notes,'') || E'\n[auto-trimmed …]' WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY contract_id ORDER BY scheduled_date, scheduled_start_time) rn FROM service_orders WHERE status='SCHEDULED' AND scheduled_date > current_date AND contract_id IN (SELECT id FROM contracts WHERE status='ACTIVE')) t WHERE rn > 1);`
  - Step 2: PL/pgSQL block that iterates ACTIVE contracts with zero future visits, calls an existing `seed_next_visit(contract_id)` helper, or inlines the same insert logic (uses `contracts.team_id`, `properties.tenant_id`, next workday from today).
  - Step 4: `INSERT INTO user_notifications …` grouped by tenant.
- No table or column changes. No RLS/grant changes. No frontend changes — the code already assumes the new model.
- Idempotent: re-running the migration finds zero rows to trim (all "extras" are already CANCELED) and zero contracts missing a next visit.

## Out of scope

- Editing individual overloaded days (providers can rebalance manually; the orange highlight is the signal).
- Touching past visits or COMPLETED/CANCELED history.
- Regenerating recurring schedules automatically — that is now an explicit provider action per the new UX.
