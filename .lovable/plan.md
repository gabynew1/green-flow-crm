## Problem

The contract-sent email to Gabriel was never enqueued because `ContractDetail.tsx` loaded the contract with `properties(id, name, customers(name))` but the email trigger reads `customers.id` / `properties.customer_id`. Those fields are `undefined`, so the send block silently skips. Already patched.

Auditing every `sendAppEmail` call site reveals the same pattern in 3 more places.

## Other broken email triggers found

### 1. `src/pages/provider/OfferDetail.tsx` — "Offer sent to client" (broken)
- Loads `offers ... properties(id, name, customers(name))`
- Reads `offer.properties.customers?.id` → always `undefined`
- Result: every offer marked "Sent to Client" silently skips the `offer-sent` email. No log row in `email_send_log`.

### 2. `src/pages/client/ClientContractDetail.tsx` — "Contract signed/rejected" notification to provider (broken — both branches)
- Loads `contracts ... properties(name, address, city)`
- Reads `contract.properties?.tenant_id` for the provider profile lookup → always `undefined`
- Result: when a client accepts or rejects a contract, the provider never receives the `contract-response` email.

### 3. `src/pages/provider/VisitDetail.tsx` — "Visit report / done" (degraded, not fully broken)
- Loads `service_orders ... properties(name, customers(name, id))`
- Reads `properties.tenant_id` → `undefined`, so the email is sent without tenant branding (no provider name in template, no tenant-scoped `From:` and subject prefix). Still delivered.

### Not broken (verified)
- `src/pages/provider/InspectionDetail.tsx` — uses `inspection.customer_id` and `inspection.tenant_id` directly from the row; both columns exist.
- `src/pages/client/ClientOfferDetail.tsx` (accept/reject) — fetches `tenant_id` in a separate query.

## Recovery for the missed contract email to Gabriel

The send function refuses unauthenticated calls and the project does not expose the service role on the client. The simplest path: I'll add a one-time "Resend notification" button to `ContractDetail.tsx` (provider view) visible for `SENT_TO_CLIENT` contracts, which re-invokes `sendAppEmail` with a new idempotency key. This also helps for any future missed sends. Alternative: revert the contract to `DRAFT` and click "Send to Client" again with the fixed code.

## Fix

### `src/pages/provider/OfferDetail.tsx`
Change the select to include the customer id and tenant id:
```ts
.select("*, properties(id, name, customer_id, tenant_id, customers(id, name)), inspections(title)")
```

### `src/pages/client/ClientContractDetail.tsx`
Change the contract select to include `tenant_id`:
```ts
.select("*, properties(name, address, city, tenant_id)")
```

### `src/pages/provider/VisitDetail.tsx`
Change the service_orders select to include `tenant_id`:
```ts
.select("*, properties(name, tenant_id, customers(name, id)), contracts(contract_name)")
```

### `src/pages/provider/ContractDetail.tsx`
Already patched in the previous turn:
```ts
.select("*, properties(id, name, customer_id, customers(id, name))")
```
Add a "Resend client notification" action visible while status is `SENT_TO_CLIENT`. It re-runs the same trigger code with idempotency key `contract-sent-${contractId}-resend-${Date.now()}`, so duplicates are intentional and traceable.

## Verification

After the patch I'll:
1. Have you (or me with a fresh contract row) flip Seren Gardens' contract `24c32256…` back to DRAFT → SENT_TO_CLIENT (or click the new Resend button) and confirm a `sent` row appears in `email_send_log` for `gabriel@zealot.ro`.
2. Spot-check one offer send, one client-side contract accept, and one visit report to confirm rows show up with correct `tenant_id` and `template_data`.

## Non-goals

- No template or queue-infrastructure changes.
- No change to how providers are looked up for client→provider notifications (that's a separate "tenant owner vs. any tenant member" concern; out of scope here).
- No change to email styling, localization, or rate limits.
