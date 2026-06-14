## Feature: Service Zones for Properties & Zone-Aware Scheduling

### Goal
Let providers group client properties into **service zones** (e.g. "North City", "Cluj-East"). Zones are a soft hint used by the scheduler to cluster visits of the same zone on the same day for the same team — never blocking, never dropping a visit. Foundation for future automated zone-per-team-per-day scheduling.

### Stack and rules
- React 18 / Vite / TS / shadcn / Supabase / react-router v6 / @tanstack/react-query.
- All new tables: `tenant_id` + RLS using existing helpers `is_provider(auth.uid())`, `get_user_tenant_id(auth.uid())`, `has_role(auth.uid(), 'PROVIDER_ADMIN')`.
- Every `CREATE TABLE public.*` followed by `GRANT` in the same migration.
- Auth roles live in `user_roles` (`PROVIDER_ADMIN` / `PROVIDER_STAFF` / `CLIENT_USER`). Operational provider permission (`full_admin` / `field_staff`) lives on the profile/team — keep matching the existing Settings.tsx pattern for UI gating; **DB enforcement uses `has_role(..., 'PROVIDER_ADMIN')`**.
- `PropertyDetail.tsx` and `ContractNew.tsx` keep raw `supabase` client (existing convention). New `ZonesSettings.tsx` uses `useTenantQuery`.
- Emerald `#10b981` is the only hardcoded color (zone default + safe fallback).
- Zones are provider-only — never expose `zone_id`, zone names, or any `service_zones` join in `/client/*` queries or UI.
- `src/integrations/supabase/types.ts` is auto-regenerated — never edited manually.

---

### Risk decisions baked into this plan
- **R1 — DB writes:** split RLS so `SELECT` is open to any tenant provider but `INSERT/UPDATE/DELETE` require `PROVIDER_ADMIN`. Field staff cannot bypass UI by hitting the API.
- **R2 — Zone map status set:** `useZoneDateMap` includes both `SCHEDULED` **and** `IN_PROGRESS` (both occupy team capacity).
- **R3 — Cache freshness:** after a contract activation writes visits, invalidate `['zone-date-map']` so the next activation in the same session sees the new bookings.
- **R4 — i18n target:** append the `zones` block to the existing **`common.json`** namespace in both locales (used by Settings today). No new namespace files.
- **R5 — Pre-existing `profile.role` reads:** out of scope. New code uses `useAuth`'s role data + provider permission as Settings.tsx already does.
- **R6 — Client portal join leakage:** add an explicit acceptance check that no `/client/*` query references `service_zones` and no client SELECT policy exists on it.

---

### STEP 1 — Migration

One new timestamped file in `supabase/migrations/`. Do not touch any existing migration.

```sql
-- Table
CREATE TABLE public.service_zones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#10b981'
               CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- GRANTs (required by Data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_zones TO authenticated;
GRANT ALL ON public.service_zones TO service_role;

ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;

-- Read: any provider in the same tenant
CREATE POLICY "zones_select_same_tenant_providers"
  ON public.service_zones FOR SELECT
  USING (public.is_provider(auth.uid())
     AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- Write: only PROVIDER_ADMIN of the same tenant
CREATE POLICY "zones_insert_admin"
  ON public.service_zones FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
          AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "zones_update_admin"
  ON public.service_zones FOR UPDATE
  USING  (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
      AND tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
          AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "zones_delete_admin"
  ON public.service_zones FOR DELETE
  USING (public.has_role(auth.uid(), 'PROVIDER_ADMIN')
     AND tenant_id = public.get_user_tenant_id(auth.uid()));

-- updated_at trigger (reuse existing helper)
CREATE TRIGGER trg_service_zones_updated_at
  BEFORE UPDATE ON public.service_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Soft link from properties; deletion of a zone nulls the FK (no app cleanup)
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS zone_id UUID
    REFERENCES public.service_zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_properties_tenant_zone
  ON public.properties(tenant_id, zone_id);
```

Types regenerate automatically after approval.

---

### STEP 2 — `ZonesSettings.tsx`

`src/components/provider/ZonesSettings.tsx`, using `useTenantQuery`.

- **List query** (single round-trip including counts):
  `service_zones.select('*, properties(count)').order('created_at')`.
- **Color helper** reused everywhere:
  `const safeColor = (c?: string|null) => c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#10b981'`.
- **Row UI**: color dot · name · `{count} properties` badge · Edit · Delete.
- **Create/Edit dialog**:
  - Name required.
  - On Supabase `23505` (unique violation) → inline field error with i18n key `zones.name_duplicate`. No toast.
  - 8-swatch color picker `['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#64748b']`, default `#10b981`.
- **Delete**:
  - count > 0 → button disabled + tooltip `zones.delete_blocked` (`{{count}}`).
  - count === 0 → confirm dialog (AlertDialog) → delete.
  - On success invalidate `['zones']`, `['properties']`, `['property']`, `['zone-date-map']`. No user warning (FK `ON DELETE SET NULL` handles it).
- **UI gating**: full CRUD for `full_admin` provider permission; `field_staff` sees read-only list with all action buttons disabled (mirror the existing Settings.tsx permission pattern). DB enforcement comes from the RLS in Step 1.

---

### STEP 3 — Settings page "Zones" tab

`src/pages/provider/Settings.tsx` currently has no Tabs. Wrap the existing page body in shadcn `<Tabs defaultValue="general">`:
- `general` → existing content untouched.
- `zones` → `<ZonesSettings />`.

Keep all existing state at page level and mount both `TabsContent` panels so the invite dialog state is not torn down on tab switch.

---

### STEP 4 — Zone selector in `ContractNew.tsx`

Single-page form, Card 1 = Customer & properties. Insertion point inside Card 1: Customer → Properties checklist → `missingInventory` warning → **Zone selector (new)**.

**State**:
```ts
const [selectedZoneId, setSelectedZoneId] = useState<string|null>(null);
const [zones, setZones] = useState<{ id:string; name:string; color:string }[]>([]);
```

**Loading**: add a 4th promise to the existing `Promise.all`:
```ts
supabase.from('service_zones').select('id, name, color').eq('tenant_id', tid).order('name')
```

**Property select** now includes `zone_id`:
```ts
supabase.from('properties').select('id, name, customer_id, zone_id').eq(...)
```

**Reset / pre-fill rules**:
- Customer changes → `setSelectedZoneId(null)`.
- `selectedPropertyIds.length === 1` → guard against deleted zone:
  ```ts
  const existing = properties.find(p => p.id === id)?.zone_id ?? null;
  setSelectedZoneId(zones.some(z => z.id === existing) ? existing : null);
  ```
- `selectedPropertyIds.length !== 1` → `setSelectedZoneId(null)`.

**UI**: shadcn Select rendered only when exactly 1 property selected. Options: `— No zone —` with sentinel `__none__` mapped to `null`, then zones with colored dot via `safeColor`. Helper text: "Saved to the property. Used to cluster visits by zone."

**Summary card**: add a "Zone" row between Properties and Services — shows zone name or "None".

**Persistence** in `handleCreate`, AFTER line items insert, BEFORE `toast.success`/`navigate`:
```ts
// Form only edits existing properties — always UPDATE, never INSERT.
if (selectedPropertyIds.length === 1 && selectedZoneId !== null) {
  const current = properties.find(p => p.id === selectedPropertyIds[0])?.zone_id ?? null;
  if (current !== selectedZoneId) {
    const { error: zoneErr } = await supabase
      .from('properties')
      .update({ zone_id: selectedZoneId })
      .eq('id', selectedPropertyIds[0]);
    if (zoneErr) toast.warning('Contract created, but zone could not be saved: ' + zoneErr.message);
  }
}
```

Multi-property contracts pass `null` to the scheduler (zones are per-property).

---

### STEP 5 — Zone row in `PropertyDetail.tsx`

Keeps raw `supabase`. Updates the `load()` select to join the zone:
```ts
supabase.from('properties')
  .select('*, customers(*), service_zones(id, name, color)')
  .eq('id', propertyId!).single()
```
Also fetch zones list once on mount (tenant-scoped).

New state: `editingZone`, `zones`, `pendingZoneId`, `savingZone`.

Inside the existing info CardContent (after address/status/description) add a "Zone" row:
- Read mode: color dot (`safeColor`) + zone name, or "Not assigned". Pencil edit icon visible only when provider permission is `full_admin`.
- Edit mode: Select (with `— No zone —` sentinel + all zones), Save / Cancel.
- Save → update properties + `load()` + invalidate `['properties']` and `['property', propertyId]`.

Add `Pencil`, `Loader2` to the existing lucide import.

---

### STEP 6 — Schedule engine (`src/lib/schedule-engine.ts`)

Soft-cluster same-zone properties on the same calendar date. Zone is a hint — never blocks or drops a visit.

**Types**:
```ts
// "YYYY-MM-DD_teamId" → Set of zoneIds booked that day.
// IN-MEMORY ONLY. Never serialize. Never store in React Query cache.
export interface ZoneDateMap { [key: string]: Set<string> }
```
`ScheduleInput` gains one optional field: `zoneId?: string | null`.

**`findAvailableSlot`** gains `zoneId?: string|null, zoneDateMap?: ZoneDateMap`:
1. If both provided: scan up to **14 days** from `targetDate`; first day where workday AND `occupancy < MAX_SLOTS_PER_DAY` AND `zoneDateMap[key]?.has(zoneId)` → book & return.
2. Otherwise fall through to existing logic unchanged.
3. After ANY successful booking: if `zoneId` and `zoneDateMap` present, add `zoneId` to `zoneDateMap[key]` (create Set if missing).

**`generateSchedule`** signature:
```ts
export function generateSchedule(
  input: ScheduleInput,
  workdayChecker: WorkdayChecker,
  existingVisitCounts: ExistingVisitMap,
  zoneDateMap: ZoneDateMap = {}     // shared across batch calls; mutated in place
): { visits: ScheduledVisit[]; zoneDateMap: ZoneDateMap }
```

**Call sites** (verified single): `src/pages/provider/ContractDetail.tsx:181`
- Destructure `const { visits } = generateSchedule(...)`.
- Pass the `zoneDateMap` from `useZoneDateMap()` as 4th arg.
- After successful visit inserts, call `queryClient.invalidateQueries({ queryKey: ['zone-date-map'] })` (R3).
- If a future loop schedules multiple contracts, reuse the same `zoneDateMap` reference across iterations.

`ZoneDateMap` (contains `Set`) must never reach Supabase or `JSON.stringify`.

---

### STEP 7 — `useZoneDateMap` hook

`src/hooks/useZoneDateMap.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import type { ZoneDateMap } from '@/lib/schedule-engine';

export function useZoneDateMap(): ZoneDateMap {
  const { profile } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data } = useQuery({
    queryKey: ['zone-date-map', today],          // rotates at midnight; invalidating ['zone-date-map'] hits any variant
    enabled: !!profile?.tenant_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_orders')
        .select('team_id, scheduled_date, status, properties(zone_id)')
        .eq('tenant_id', profile!.tenant_id)
        .in('status', ['SCHEDULED', 'IN_PROGRESS'])   // R2: both occupy capacity
        .gte('scheduled_date', today);
      if (error) throw error;
      return data ?? [];
    },
  });

  const map: ZoneDateMap = {};
  for (const v of data ?? []) {
    const zoneId = (v.properties as any)?.zone_id;
    if (!zoneId || !v.team_id || !v.scheduled_date) continue;
    const key = `${v.scheduled_date}_${v.team_id}`;
    (map[key] ??= new Set<string>()).add(zoneId);
  }
  return map;
}
```

---

### STEP 8 — Translations

Append a `zones` block to **`src/i18n/locales/en/common.json`** and **`src/i18n/locales/ro/common.json`** (R4). Do not create new namespace files.

**en**:
```json
"zones": {
  "title": "Service Zones",
  "new_zone": "New Zone",
  "edit_zone": "Edit Zone",
  "zone_name": "Zone Name",
  "zone_color": "Color",
  "no_zone": "— No zone —",
  "not_assigned": "Not assigned",
  "delete_confirm": "Delete this zone?",
  "delete_blocked": "{{count}} properties use this zone — reassign them first.",
  "assigned_properties": "{{count}} properties",
  "zone_label": "Service Zone",
  "name_duplicate": "A zone with this name already exists."
}
```

**ro**:
```json
"zones": {
  "title": "Zone de Servicii",
  "new_zone": "Zonă Nouă",
  "edit_zone": "Editează Zona",
  "zone_name": "Denumire Zonă",
  "zone_color": "Culoare",
  "no_zone": "— Fără zonă —",
  "not_assigned": "Neatribuit",
  "delete_confirm": "Ștergi această zonă?",
  "delete_blocked": "{{count}} proprietăți folosesc această zonă — reatribuiți-le mai întâi.",
  "assigned_properties": "{{count}} proprietăți",
  "zone_label": "Zonă de Servicii",
  "name_duplicate": "Există deja o zonă cu acest nume."
}
```

If `common.json` is not the locale file used by Settings today, mirror the location of an existing Settings key — do not create a new namespace.

---

### Out of scope
- Any existing migration file.
- `src/integrations/supabase/client.ts`, `types.ts`, `supabase/config.toml`.
- Any `/client/*` page or component.
- `ai-assistant` edge function, email templates.
- `ServiceVisits.tsx` calendar (zone badges deferred to next phase).
- `MAX_SLOTS_PER_DAY` / `TIME_SLOTS` constants.
- Refactoring pre-existing `profile.role` reads (R5).

---

### Implementation order
1. Migration (Step 1) — gate everything on approval.
2. `useZoneDateMap` hook + schedule engine update (Steps 6, 7).
3. Update `ContractDetail.tsx` call site — destructure, pass map, invalidate after insert.
4. `ZonesSettings` + Settings Tabs wrapper (Steps 2, 3).
5. ContractNew zone selector (Step 4).
6. PropertyDetail zone row (Step 5).
7. Translations (Step 8).
8. QA against checklist.

---

### Acceptance checklist
- [ ] Admin can create / rename / recolor / delete zones in Settings → Zones.
- [ ] Duplicate name → inline field error (no toast).
- [ ] Delete blocked when count > 0; count from joined query (no second round-trip).
- [ ] Zone delete silently nulls `zone_id` via `ON DELETE SET NULL`; no app cleanup, no user warning.
- [ ] On delete, invalidates `zones`, `properties`, `property`, `zone-date-map`.
- [ ] `safeColor` fallback applied in ZonesSettings, ContractNew, PropertyDetail.
- [ ] RLS: field_staff cannot insert/update/delete zones via API even if UI is bypassed.
- [ ] RLS: cross-tenant access denied on `service_zones`.
- [ ] No `service_zones` join, no `zone_id` reference, no zone copy in any `/client/*` query or component.
- [ ] Zone selector in ContractNew renders only when exactly 1 property selected, after Properties checklist and inventory warning.
- [ ] Pre-fill guards deleted-zone UUID → falls back to `null`.
- [ ] Existing property zone change → UPDATE only when changed. No INSERT path.
- [ ] PropertyDetail edit icon visible only for full_admin.
- [ ] `generateSchedule` returns `{ visits, zoneDateMap }`; ContractDetail destructures `{ visits }` and passes the shared map.
- [ ] After contract activation, `['zone-date-map']` is invalidated so next activation sees the bookings.
- [ ] `useZoneDateMap` includes both SCHEDULED and IN_PROGRESS visits.
- [ ] `ZoneDateMap` (Sets) never serialized, never sent to Supabase.
- [ ] `en` and `ro` `zones` keys present in the Settings i18n file.
- [ ] Zone clustering: same-zone date preferred within 14 days; falls back gracefully — no visit ever dropped.