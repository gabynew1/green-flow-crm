

## Plan: Archive Button + Opportunities Tab (Including Opportunities in Archive Logic)

### Summary
Replace the current Cancel/X buttons on all Kanban cards with an Archive button. Add an `archived` boolean column to `inspections`, `offers`, and `contracts`. Archived items are hidden from Kanban but visible in tab tables. Add an "Opportunities" tab to SalesPipeline.

### DB Migration
```sql
ALTER TABLE inspections ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE contracts ADD COLUMN archived boolean NOT NULL DEFAULT false;
```

### File Changes

| File | Change |
|---|---|
| `PipelineKanban.tsx` | Add `.eq("archived", false)` to all 3 queries. Replace `handleCancelInspection`/`handleCancelOffer`/`handleCloseContract` with a single `handleArchive(table, id)` that sets `archived = true`. Replace X button with Archive icon button on ALL cards (opportunities, inspections, offers, contracts). Keep primary action buttons (Schedule, Gen. Offer, Gen. Contract). |
| `SalesPipeline.tsx` | Add "Opportunities" tab that renders `<Inspections embedded statusFilter="DRAFT" />` |
| `Inspections.tsx` | Accept optional `statusFilter` prop. When provided, pre-filter the query and hide/lock the status filter dropdown. |

### Detail

**Kanban archive flow**: Every card in every column (including Opportunities) gets an archive button with a confirmation dialog ("Archive this item? It will be removed from the pipeline view but remain in historical records."). On confirm, sets `archived = true` on the respective table.

**Opportunities tab**: Shows all DRAFT inspections (including archived ones) in the same table format as Inspections, filtered to `status = 'DRAFT'`.

