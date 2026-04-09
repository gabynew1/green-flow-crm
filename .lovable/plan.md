## Plan: Teams, Global Capacity Scheduling, Time Slots, and Client Nav Fix — IMPLEMENTED

All items from this plan have been implemented:

1. ✅ **DB Migration**: `teams`, `team_members` tables created; `service_orders` extended with `team_id`, `scheduled_start_time`, `scheduled_end_time`; default "Team A" seeded; auto-create trigger on tenants
2. ✅ **Client Nav Fix**: "My Properties" sidebar highlights on sub-paths like `/client/properties/*`
3. ✅ **Team Management (Settings)**: CRUD for teams with color picker and member assignment
4. ✅ **Auto-Schedule Engine**: `generateContractVisits()` runs on contract activation with team-aware capacity (4 slots/day per team)
5. ✅ **Service Visits Calendar**: Team filter dropdown, color-coded visit cards, time slot display, slot occupancy indicators
6. ✅ **Create Visit Dialog**: Team selector and time slot picker (08:00/10:00/12:00/14:00) with capacity check
