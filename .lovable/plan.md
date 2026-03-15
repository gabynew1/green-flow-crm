

## Plan: Revamp Service Catalog — Categories, Units, and New Services

### Overview
Replace the `code` column concept with **Category** (dropdown), rename **Name** to **Service**. Populate with the uploaded 55 services across 5 categories. Add a 3-dot menu next to "Add Service" for managing categories and units.

### Database Changes

**1. Repurpose `code` column as category storage**
The `code` column on `service_catalog` will now store the category name (e.g. "Design & Consulting"). No schema change needed — just a semantic shift. The column already exists as `text NOT NULL`.

**2. Delete existing catalog rows and insert new ones**
Use the data tool to:
- DELETE all rows from `service_catalog` where `tenant_id IS NULL` (global seed services)
- INSERT the 55 new services from the uploaded file, using `code` = category name, `name` = service name, `default_unit` = unit, `default_price` = price

### UI Changes — `ServiceCatalog.tsx`

**3. Rename headers and form fields**
- Table header: "Code" → "Category", "Name" → "Service"
- Sort field type: `"code"` remains internally but displays as "Category"

**4. Add Service dialog — rework the form**
- **Category**: `Select` dropdown populated from distinct categories found in the catalog. Free text fallback not needed here since categories are managed separately.
- **Service** (name): Free text `Input` with `maxLength={100}`
- **Unit**: `Select` dropdown with predefined units extracted from the catalog (sqm, m, hour, job, flat, count/visit). Users can also manage units via the 3-dot menu.
- **Price**: Keep as number input

**5. Three-dot menu (DropdownMenu) next to "Add Service" button**
Contains:
- **Manage Categories** — opens a dialog to create/edit/delete categories. Categories are derived from distinct `code` values in `service_catalog`. Creating a category just means it becomes available in the dropdown. Editing renames the category across all services. Deleting removes it from the dropdown (only if no services use it).
- **Manage Units** — opens a dialog to create/edit/delete units. Units are stored locally in state (derived from distinct `default_unit` values). Same pattern: create adds to dropdown, edit renames across services, delete only if unused.

**6. Update all references to `code` in display**
- `CreateAdHocVisitDialog.tsx`: Change `{svc.code}` display to show category instead
- `OfferDetail.tsx`, `ContractDetail.tsx`, `ClientContractDetail.tsx`: Where `service_catalog(name, code)` is selected and displayed, rename label from "Code" to "Category" if shown

### Files to change
- **Data operation**: DELETE old services + INSERT 55 new services
- **`src/pages/provider/ServiceCatalog.tsx`**: Major rework — category/unit dropdowns, 3-dot menu with manage dialogs
- **`src/components/provider/CreateAdHocVisitDialog.tsx`**: Minor label change
- **`src/pages/provider/OfferDetail.tsx`**: Minor label change if code is displayed
- **`src/pages/provider/ContractDetail.tsx`**: Minor label change if code is displayed

