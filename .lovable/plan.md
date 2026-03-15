

## Plan: Category-First Service Selection in Visit Creation

### What
Replace the flat service checklist in `CreateAdHocVisitDialog` with a two-step picker: first select a category from a dropdown, then check services within that category. The user can switch categories and keep adding services across categories.

### Changes

**Edit: `src/components/provider/CreateAdHocVisitDialog.tsx`**

Replace the services section (lines 246-268) with:

1. **Add state**: `selectedCategory` (string, defaults to empty)
2. **Derive categories**: Extract unique `code` values from the services list
3. **Category dropdown**: `<Select>` showing all categories
4. **Filtered service checkboxes**: Show only services matching the selected category, with checkboxes. Already-checked services persist across category switches.
5. **Selected services summary**: Below the picker, show a list of all selected services (with category labels) so the user can see what they've picked across categories and optionally remove them.

### Files
- **Edit**: `src/components/provider/CreateAdHocVisitDialog.tsx` — category dropdown + filtered checkboxes + selected summary

