

# Property Unique IDs and Sharing Warnings

## What We're Building

1. **Unique Property ID** — Each property gets an auto-generated ID in format `LastName_PropertyName` (e.g., `Smith_BackGarden`). Displayed on the property detail page with a copy button, similar to how the Client ID works today.

2. **Customer ID sharing warning** — When the client copies their Customer ID (GC-XXXXXX), show a confirmation dialog warning that sharing this ID will grant access to **all properties not already connected at the property level** with another provider.

## Database Changes

**Migration: Add `unique_property_id` to `properties`**

```sql
ALTER TABLE public.properties
  ADD COLUMN unique_property_id text UNIQUE;
```

**Migration: Trigger to auto-generate `unique_property_id` on insert/update**

A database function that:
- Fetches the client's `full_name` from `profiles` via `customer_id`
- Extracts the last name (last word of `full_name`)
- Strips spaces/special chars from the property `name`
- Concatenates as `LastName_PropertyName`
- Appends a numeric suffix if a collision exists (e.g., `Smith_Garden_2`)

Fires on INSERT and on UPDATE of `name` or `customer_id`.

**Backfill existing properties** with a one-time UPDATE using the same logic.

## Frontend Changes

### 1. Property Detail Page (`src/pages/client/ClientPropertyDetail.tsx`)
- Display the `unique_property_id` with a copy-to-clipboard button (similar to Client ID in `ClientLayout.tsx`)
- Show it prominently near the property name

### 2. Client Layout — Customer ID Warning (`src/components/client/ClientLayout.tsx`)
- Replace the direct `navigator.clipboard.writeText` in `copyId()` with opening an `AlertDialog`
- Warning text: "Sharing your Customer ID will give the provider access to all your properties that are not already connected at the property level with another provider. Continue?"
- On confirm: copy to clipboard and show success toast
- On cancel: dismiss

### 3. Property List (`src/pages/client/ClientProperties.tsx`)
- Show the `unique_property_id` under each property card for quick reference

## Files to Change

| File | Change |
|------|--------|
| DB Migration | Add column + trigger + backfill |
| `src/pages/client/ClientPropertyDetail.tsx` | Display property ID with copy button |
| `src/components/client/ClientLayout.tsx` | Add AlertDialog warning on Customer ID copy |
| `src/pages/client/ClientProperties.tsx` | Show property ID in cards |

