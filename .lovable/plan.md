

## Plan: Enhanced Contract Line Item Dialog

### What changes

The "Add Line Item" dialog in Contract Detail will be redesigned with three key improvements:

1. **Category → Service cascading selects**: Instead of a flat service list, the user first picks a category (e.g., "Regular Maintenance", "Garden Landscaping"), then picks a service within that category. The service list filters based on the selected category.

2. **Inventory item picker**: After selecting a property-linked contract, the dialog fetches inventory items for that property. A new "Inventory Item" dropdown lets the user link a line item to a specific asset (e.g., "Lawn - 100 m²"). When selected, it auto-fills quantity and unit from the inventory item.

3. **Frequency selector**: Already exists but will be kept in the improved layout.

### File changes

**`src/pages/provider/ContractDetail.tsx`**:
- Add state for `selectedCategory`, `inventoryItems`, and load inventory on dialog open using the contract's `property_id`
- Group `catalog` items by their `code` (category) field to extract unique categories
- Replace the single "Service" select with two selects: "Category" then "Service" (filtered by category)
- Add an "Inventory Item (optional)" select that shows items from the property's inventory (e.g., "Lawn A - 100 m²"), and on selection auto-populates quantity and unit fields
- Keep frequency, unit price, max/period, and notes fields as-is

### UI flow

```text
┌─────────────────────────────────┐
│ Add Line Item                   │
├─────────────────────────────────┤
│ Category *      [▼ Regular Maintenance ]│
│ Service *       [▼ Lawn Repair        ]│
│ Inventory Item  [▼ Main Lawn - 100 m² ]│  ← optional, auto-fills qty/unit
│ Frequency       [▼ Per Visit          ]│
│ Quantity   [100]   Unit   [m²]         │  ← pre-filled from inventory
│ Unit Price [15]    Max/Period [∞]      │
│ Notes      [___]                       │
│ [        Add        ]                  │
└─────────────────────────────────┘
```

### Data queries
- Categories derived from `catalog` grouped by `code` field (already loaded)
- Inventory: `supabase.from("inventory").select("id").eq("property_id", contract.properties.id)` then `supabase.from("inventory_items").select("*").eq("inventory_id", inventoryId)` — fetched when dialog opens

