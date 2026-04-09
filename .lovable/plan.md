

## Plan: Teams, Global Capacity Scheduling, Time Slots, and Client Nav Fix

This plan extends the previously approved auto-scheduling plan by introducing the concept of **Teams** — each tenant starts with a default "Team A", and admins can create more teams from Settings. Each team gets its own calendar, and the Service Visits page allows filtering by team or viewing all teams with color coding.

---

### 1. Database Changes (Migration)

**New table: `teams`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tenant_id | uuid NOT NULL | |
| name | text NOT NULL | Default "Team A" |
| color | text NOT NULL | Hex color, e.g. `#3B82F6` |
| created_at | timestamptz | |

**New table: `team_members`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| team_id | uuid NOT NULL | FK to teams |
| user_id | uuid NOT NULL | |
| created_at | timestamptz | |
| UNIQUE(team_id, user_id) | | |

**Alter `service_orders`**: Add columns:
- `team_id` (uuid, nullable, references teams)
- `scheduled_start_time` (time, nullable)
- `scheduled_end_time` (time, nullable)

**RLS**: Provider-scoped (tenant_id match) for teams/team_members. Clients get SELECT on service_orders (already exists).

**Seed**: A database trigger `auto_create_default_team` on `tenants` INSERT creates a "Team A" with color `#3B82F6`. For existing tenants, the migration inserts a default team.

---

### 2. Client Navigation Fix (`ClientLayout.tsx`)

Remove `exact: true` from "My Properties" nav item so it stays highlighted on `/client/properties/*` sub-pages.

---

### 3. Team Management in Settings (`Settings.tsx`)

Add a new **"Teams"** card section:
- List all teams with name, color swatch, and member count
- "Add Team" button opens a dialog (name + color picker)
- Click a team to edit: rename, change color, add/remove members from tenant staff list
- Enforce minimum 1 member per team
- Delete team (only if not the last team; reassign visits first)

---

### 4. Auto-Schedule Engine on Contract Activation (`ContractDetail.tsx`)

When provider clicks "Activate" on a contract:

1. Read `visit_frequency_count`, `visit_frequency_type`, `start_date`, `end_date`
2. Determine the assigned team (from a team selector on the contract, or default to "Team A")
3. Generate evenly-spaced target dates per period:
   - Weekly: spread N visits across Mon-Sat (e.g., 2/week → Mon+Thu)
   - Monthly: spread N visits across the month (e.g., 2/month → 1st+15th)
4. For each target date:
   - Skip if not a workday (Sunday, holiday, blocked day)
   - Count existing visits for **that team** on that day
   - If team has 4 visits (capacity), shift to next valid workday
   - Assign first available 2-hour slot: 08:00, 10:00, 12:00, 14:00
5. Create `service_orders` with `team_id`, `scheduled_start_time`, `scheduled_end_time`, `contract_id`, status `SCHEDULED`
6. Create `service_order_items` from contract line items
7. Toast summary: "24 visits scheduled for Team A"

```text
Algorithm:
  For each period in [start_date → end_date]:
    targets = N evenly-spaced dates in period
    For each target:
      candidate = target
      While !isWorkday(candidate) OR teamVisitCount(candidate) >= 4:
        candidate += 1 day
      slot = firstFreeSlot(candidate, team_id)  // 08:00/10:00/12:00/14:00
      createVisit(candidate, slot, team_id)
```

---

### 5. Service Visits Calendar Updates (`ServiceVisits.tsx`)

- Add a **team filter dropdown** at the top: "All Teams" (default) or specific team
- When "All Teams" is selected, color-code each visit card/chip by `team.color`
- When a specific team is selected, show only that team's visits
- Show time slot on each visit card (e.g., "08:00–10:00")
- Day view: show slot occupancy per team (e.g., "Team A: 3/4 slots")

---

### 6. Create Visit Dialog Updates (`CreateAdHocVisitDialog.tsx`)

- Add a **team selector** dropdown (defaults to user's team or "Team A")
- Add a **time slot picker** (08:00, 10:00, 12:00, 14:00)
- Check capacity for selected team+date before allowing creation

---

### Files to change

| File | Change |
|------|--------|
| DB migration | Create `teams`, `team_members` tables; alter `service_orders`; seed default teams; RLS |
| `src/components/client/ClientLayout.tsx` | Remove `exact: true` from "My Properties" |
| `src/pages/provider/Settings.tsx` | Add Teams management card |
| `src/pages/provider/ContractDetail.tsx` | Add `generateContractVisits()` with team-aware capacity scheduling |
| `src/pages/provider/ServiceVisits.tsx` | Add team filter dropdown, color coding, time slot display |
| `src/components/provider/CreateAdHocVisitDialog.tsx` | Add team selector and time slot picker |

