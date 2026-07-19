## Goal
Surface the property's **Service Zone** on every service visit view. Property↔zone mapping already works — no changes there.

## Changes

### 1. Shared chip
Create `src/components/provider/ZoneChip.tsx` — small presentational component (colored dot + zone name, muted "—" fallback). Reused across all surfaces below for consistency.

### 2. Provider — Service Visits list
`src/pages/provider/ServiceVisits.tsx`
- Extend `service_orders` select: `properties(..., service_zones(id, name, color))`.
- Add a compact **Zone** column (via `ZoneChip`).
- Add a **Zone filter** dropdown next to the existing Property filter (options: All zones · No zone · one per tenant zone).

### 3. Provider — Visit Detail
`src/pages/provider/VisitDetail.tsx`
- Extend header query to include `properties(..., service_zones(name, color))`.
- Render a `ZoneChip` in the header info block next to the property/address line.

### 4. Client — Visit Detail
`src/pages/client/ClientVisitDetail.tsx`
- Same read-only `ZoneChip` in the header, so clients see which zone their visit is grouped under.

### 5. Customer Detail visit sections
`src/pages/provider/CustomerDetail.tsx`
- Extend the visits sub-query to include the property's zone.
- Render a `ZoneChip` next to each visit row in Overdue / Upcoming / Past groups.

### 6. i18n
Add under existing `zones` key in `src/i18n/locales/{en,ro}/provider.json`:
- `filter_all_zones`: "All zones" / "Toate zonele"
- `filter_no_zone`: "No zone" / "Fără zonă"
- `zone_column`: "Zone" / "Zonă"

## Out of scope
- No DB or RLS changes.
- No changes to property→zone assignment UI (already exists).
- No changes to scheduling engine.
