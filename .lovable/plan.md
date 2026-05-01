## Goal

When a client and provider are linked, both sides must see **the same property and inventory rows** — not divergent copies. Today, approving a link request silently overwrites the property's `customer_id` to a brand-new provider-side customer record, which detaches the property from the client's view. That's why Sonia Pintea's two newly-created properties "disappeared".

We will:

**A. Repair Sonia's data now** so both Sonia and Serene Garden see the same two properties.

**B. Fix the `_apply_task_side_effects` link_request logic** so future approvals never break the client view.

**C. Confirm vendor inventory CRUD** (add / update / delete on shared property inventory).

---

### A. Data repair for Sonia Pintea

There are two existing properties (`Avangarde Forest 7` at `Tuberozelor 8` and `Tuberozelor 8a`) currently attached to a provider-side customer (`9c3518b2…`) instead of Sonia's own customer record (`456bbd8e…`).

One-shot SQL update:

- Re-point both properties' `customer_id` → `456bbd8e‑5579‑41ce‑aa5e‑38ac7aa70c91` (Sonia's profile customer)
- Keep `tenant_id = 83eafc5d…` (Serene Garden) so the provider still sees them
- Inventory rows already point to those properties — no change needed for them; they'll remain visible to both sides via the property linkage
- Mark the now-orphan provider-side duplicate customer (`9c3518b2…`) as inactive (status = `'INACTIVE'`) so Serene Garden's customers list isn't cluttered with a duplicate of Sonia

After the repair, both portals will list the same 2 properties.

---

### B. Fix `_apply_task_side_effects` for `link_request`

Rewrite the link-approval logic so it **shares** rather than **migrates** data:

1. Stop creating a new `customers` row for the client. Instead, reuse the client's existing `customer_id` (from `profiles.customer_id`). If the provider already had a CRM-side customer with the same email, merge it into the client's record (or just mark the duplicate inactive).
2. On the selected properties, set **only** `tenant_id = provider_tenant`. Never overwrite `customer_id` — the client must keep ownership of their own properties.
3. On `inventory` and `inventory_items` for those properties: set `tenant_id = provider_tenant`. (Already the case — keep this; it's what enables the provider RLS policy.)
4. Activity log + provider notifications stay the same, but reference the client's real customer record.

This makes the data model truly shared:

```text
properties.customer_id  → client's customer (Sonia)        → client RLS sees them
properties.tenant_id    → provider tenant (Serene Garden)  → provider RLS sees them
```

Both portals query the same row.

---

### C. Vendor inventory CRUD

The existing RLS already grants providers `ALL` on `inventory` and `inventory_items` where `tenant_id = get_user_tenant_id(auth.uid())`. After step B re-tags the inventory `tenant_id`, the provider can already add / update / delete inventory items.

We will:
- Verify Serene Garden's existing UI for editing property inventory works on Sonia's two properties (the existing `inventory_items` CRUD page).
- No schema change needed — just confirm and, if missing, expose the "Edit Inventory" entry from the customer/property detail view in the provider workspace.

---

### Files / changes

**Migration (single file)**
- `supabase/migrations/<ts>_share_link_request_data.sql`
  - One-shot `UPDATE` repairing Sonia's 2 properties + de-duplicating the provider-side customer.
  - `CREATE OR REPLACE FUNCTION public._apply_task_side_effects(...)` with the new "share, don't migrate" logic.

**Frontend**
- Quick audit of `src/pages/provider/PropertyDetail.tsx` (or equivalent) to make sure inventory items can be added/edited/deleted from the provider side. Add the entry point if missing — no new components expected.

No changes to the client app are needed; it will start showing the repaired properties immediately.

---

### Risk & rollback

- The migration is idempotent: re-running it is safe.
- If anything goes wrong with the repair, we can re-attach the properties to the provider-side customer with one query (the IDs are preserved).
- The function rewrite is backward compatible — old approved tasks aren't re-processed.
