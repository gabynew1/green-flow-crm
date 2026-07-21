
## Review

The user's approach is correct and sufficient. I verified the live function definition — the only broken reference is one subquery:

```sql
SELECT count(*) FROM public.visits v WHERE v.tenant_id = p.tenant_id
```

`public.visits` does not exist; visit records live in `public.service_orders` (`tenant_id uuid` column present, RLS enabled). No column mapping is needed because we only `count(*)` filtered by `tenant_id`. All other referenced tables (`profiles`, `tenants`, `tenant_email_settings`, `customers`, `offers`, `lifecycle_email_log`, `suppressed_emails`) exist and are unchanged.

No frontend or edge function changes required — signature, return columns, params, and SECURITY DEFINER settings all stay identical.

## Checklist against the user's spec

1. Only reference to `public.visits` → replaced with `public.service_orders`. ✅
2. `service_orders.tenant_id` exists → count query works. ✅
3. No joins on visits — just a `count(*)` — nothing else to adjust. ✅
4. Tenant isolation preserved via `WHERE v.tenant_id = p.tenant_id`. ✅
5. `service_orders` has a `tenant_id` index; count is bounded per tenant and runs at most a few hundred times per cron tick — fine. ✅
6. `SECURITY DEFINER`, `SET search_path = public`, and the service-role guard block stay verbatim. ✅
7. Grants: current grants are unchanged by `CREATE OR REPLACE FUNCTION` — no explicit REVOKE/GRANT needed, but the migration re-asserts `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and `GRANT EXECUTE ... TO service_role` to be defensive and match the user's spec. ✅
8. Callers (`lifecycle-email-drip/index.ts`) unchanged. ✅

## Edge cases

- **Zero service orders for tenant** → `count(*)` returns 0 → `visits_count = 0` → day_7 gate uses `visits_count >= 3` correctly.
- **Multiple orders / multiple customers** → unaffected, still a per-tenant `count(*)`.
- **Already-emailed users** → `lifecycle_email_log` NOT EXISTS guard unchanged.
- **Day-0/2/7 windows** → window clause logic untouched.
- **NULL order dates** → not read; `count(*)` ignores column values.
- **Cross-tenant leakage** → `v.tenant_id = p.tenant_id` predicate preserved; SECURITY DEFINER function only executable by `service_role`.

## Migration

Single `CREATE OR REPLACE FUNCTION public.lifecycle_drip_candidates(_step text, _safety_cap integer DEFAULT 200)` with identical signature and body, swapping the one subquery:

```
FROM public.service_orders v WHERE v.tenant_id = p.tenant_id
```

Followed by:

```sql
REVOKE ALL ON FUNCTION public.lifecycle_drip_candidates(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_drip_candidates(text, integer) TO service_role;
```

## Files touched

- **New migration** — replaces the RPC body. No other files.

## Out of scope

- Renaming `visits_count` (kept for backward compat with the edge function's `Candidate` type).
- Changing the day_7 threshold or filter logic.
- Any changes to `lifecycle-email-drip/index.ts`, cron schedule, or templates.
