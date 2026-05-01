## Goal

Make inventory management a first-class step of the inspection workflow:
1. Inspector goes from the inspection to the property's inventory page, updates it, and confirms.
2. Inspection card shows whether the inventory step is done (auto-detected + explicit confirm).
3. "Generate Offer" auto-creates one offer line item per inventory item; user only edits prices.
4. If inventory looks empty/stale, show a warning but never block.

## Database changes (single migration)

Add two columns to `inspections` to track the inventory step:

- `inventory_marked_complete_at timestamptz` — set when the user clicks "Mark inventory complete".
- `inventory_marked_complete_by uuid` — who confirmed it.

No new RLS needed (inherits existing inspection policies).

## Backend logic

Extend `WorkflowEngine.completeInspectionAndGenerateOffer`:
- After creating the offer (existing logic), fetch all `inventory_items` for the inspection's `property_id`.
- For each item, insert an `offer_line_items` row with:
  - `custom_name` = inventory item `name` (with category prefix, e.g. `LAWN — Front lawn`)
  - `quantity` = inventory item `quantity`
  - `unit` = inventory item `unit`
  - `notes` = inventory item `notes`
  - `service_catalog_id` = NULL (provider can attach a service later)
  - `unit_price` = NULL (provider fills in pricing)
- Skip if no items exist (offer is created empty as today).
- Recompute and store `offers.total_value` (will be 0 until prices are added).

## UI changes

### A. InspectionDetail.tsx — new "Property Inventory" card
Inserted between Details and Actions. Shows:
- Item count for the property's inventory.
- Auto-detect status: "Updated since inspection" if any item.updated_at > inspection.inspected_date (or scheduled_at fallback). Otherwise "Pending".
- "Last item updated" timestamp.
- Buttons:
  - **Open Property Inventory** → navigates to `/provider/properties/:propertyId` (inventory tab).
  - **Mark Inventory Complete** (when status is SCHEDULED and not yet marked) → sets `inventory_marked_complete_at = now()` and the user id.
  - "Marked complete by X on Y" badge once set; with an "Undo" small link that clears the timestamp (in case of mistake).

The "Generate Offer" action gains a soft-warning state:
- If `inventory_items` count is 0 OR neither auto-detected updates nor explicit confirm exist, the AlertDialog body shows a yellow note: "No inventory updates detected since the inspection was scheduled. The offer will be created without line items." Button still enabled.
- Otherwise the dialog says "X items from the property inventory will be added as line items. You can edit prices afterwards."

### B. PipelineKanban.tsx — inventory chip on inspection cards

For cards in the "Inspections" column (status = SCHEDULED), fetch a lightweight summary alongside existing data:
- For each scheduled inspection, query `inventory_items` count + `MAX(updated_at)` for that property.
- Render a small chip below the customer/property row:
  - Green check `Inventory updated` if `inventory_marked_complete_at IS NOT NULL` OR (count > 0 AND max(updated_at) > inspection.inspected_date).
  - Grey clock `Inventory pending` otherwise.

Implementation: extend the existing `load()` Promise.all with a join-style query. Keep it cheap by fetching only what's needed for SCHEDULED inspections.

## Layout sketch

```text
Inspection Detail
┌──────────────────────────────────────────────┐
│ Title: First inspection — Avangarde Forest   │
│ Status: Scheduled                            │
├──────────────────────────────────────────────┤
│ Property | Contact                           │
├──────────────────────────────────────────────┤
│ Inspection Details (notes, date)             │
├──────────────────────────────────────────────┤
│ Property Inventory                           │
│ 7 items · Last update Apr 28                 │
│ [✓ Updated since inspection]                 │
│ [Open Property Inventory] [Mark Complete]    │
├──────────────────────────────────────────────┤
│ [Save] [Generate Offer]                      │
└──────────────────────────────────────────────┘
```

```text
Pipeline card (Inspections column)
┌──────────────────────────────────┐
│ First inspection                 │
│ Pintea · Avangarde Forest 7      │
│ Scheduled  ✓ Inventory updated   │
│ [Gen. Offer ▸] [Archive]         │
└──────────────────────────────────┘
```

## Files touched

- `supabase/migrations/<new>.sql` — add `inventory_marked_complete_at`, `inventory_marked_complete_by` to `inspections`.
- `src/lib/workflow-engine.ts` — extend `completeInspectionAndGenerateOffer` to import inventory items as offer line items.
- `src/pages/provider/InspectionDetail.tsx` — new Inventory card, mark-complete action, smarter Generate Offer dialog copy.
- `src/components/provider/PipelineKanban.tsx` — load inventory summary for scheduled inspections, render the chip.
- `src/integrations/supabase/types.ts` — auto-regenerated after migration.
