# Tenant + Client Lifecycle: Decommission, Inactivity, Auto-Reactivation, Deletion

## Goal

Cut storage cost by purging unused **tenants AND client accounts**, while giving owners fair warning, an easy way to come back, and only contacting them on business days.

## Two parallel lifecycles, same rules

### A) Tenant (provider organization) lifecycle

```text
active ──(180d no PROVIDER_ADMIN login)──▶ inactivity_warned
   │                                              │
   │   (5 BUSINESS days later, still no login)    ▼
   │                                       soft_locked  ◀── Super Admin "Decommission"
   │                                              │
   │   (PROVIDER_ADMIN logs in)                   ├─▶ Auto-reactivate to active
   │ ◀────────────────────────────────────────────┤
   │                          (30d locked) email_30
   │                          (90d locked) email_90
   │                  (150d locked, T-30) flagged_for_deletion + email
   │                  (T-5 BUSINESS days) email_final_warn
   │                          (180d locked) HARD DELETE
   │                              email_deleted (post-mortem)
```

### B) Client account lifecycle (NEW)

Same shape, applied per `customers` row (the client account). Driver: last sign-in of the linked CLIENT_USER (`profiles.user_id` where `customer_id = customers.id`). Same thresholds, same 7 emails, same auto-reactivation on login.

```text
active ──(180d no CLIENT_USER login)──▶ inactivity_warned
   ... (identical timeline) ...
   ──▶ HARD DELETE of the customer + their properties + inventory + history
```

Notes specific to clients:
- A client account that is **linked to an active tenant** but the client themselves never logs in still ages out — the provider's record of that customer remains as a "tenant-owned customer" (we move ownership to the tenant before delete; see deletion semantics below).
- A client account with **no tenant link AND no logins for 180d** is fully eligible for deletion.
- Manual decommission is also available to Super Admins on the client list.

## Business-day & EU bank-holiday gating (applies to ALL lifecycle emails and in-app notifications)

A new utility decides whether "now" is a sendable moment:

- **Sendable hours**: 09:00–17:00 Europe/Bucharest, Mon–Fri.
- **Skip Sundays AND Saturdays.** (Existing `useWorkdays` only skips Sundays — extend it.)
- **Skip Romanian bank holidays** from `global_holidays` (already in DB).
- **Skip major EU bank holidays** (new): seed `global_holidays` with country_code `EU` for fixed/computed dates that are widely observed across the EU and major partner countries:
  - New Year's Day (Jan 1)
  - Epiphany (Jan 6) — observed in DE, AT, IT, ES, etc.
  - Good Friday (computed) — observed in most of Western Europe
  - Easter Monday (computed)
  - Labour Day (May 1)
  - Europe Day (May 9) — soft skip, optional
  - Ascension Day (computed) — DE, FR, NL, BE, etc.
  - Whit Monday (computed)
  - Assumption (Aug 15) — FR, IT, ES, AT, BE, etc.
  - All Saints' Day (Nov 1) — FR, IT, ES, AT, BE, PL, etc.
  - Christmas Eve (Dec 24)
  - Christmas Day (Dec 25)
  - Boxing Day / St. Stephen's (Dec 26)
  - New Year's Eve (Dec 31)
- **Skip Aug 1–15** entirely (continental summer shutdown window) — configurable, defaults on.
- **Skip Dec 23 – Jan 2** entirely (year-end window) — configurable, defaults on.

Deferred sends are NOT cancelled — they're rescheduled to the **next business day** at 09:00 Europe/Bucharest. Deletion *execution* is also deferred: if `scheduled_delete_at` falls on a non-business day or holiday, slide it to the next business day so the post-mortem email can go out the same day. The 5-business-day countdown for the final warning is computed using the same calendar.

Implementation: SQL function `public.next_business_moment(_from timestamptz) RETURNS timestamptz` in `SECURITY DEFINER`, used by both the SQL cron job and edge functions. A matching TS helper `nextBusinessMoment()` in `src/lib/businessCalendar.ts` for any client-side preview.

In-app notifications follow the same rule: enqueue with `not_before = next_business_moment(now())` and a small dispatcher reads the queue.

## Auto-reactivation

Provider side: PROVIDER_ADMIN login flips tenant back to `active`.
Client side: CLIENT_USER login flips their customer row back to `active`. PROVIDER_STAFF and non-owner client logins do NOT reactivate.

Both go through a single edge function `lifecycle-touch-login` invoked from `useAuth.tsx` after sign-in. Resets the email cycle counter so re-aged accounts get the full warning sequence again.

## Email schedule (7 emails, identical for both lifecycles)

All sends are gated by `next_business_moment` and de-duped per `(subject_id, cycle_started_at, step)`.

| # | When                                              | Template (tenant / client variant)            |
|---|---------------------------------------------------|-----------------------------------------------|
| 1 | T-5 business days before lock (warned state)      | `lifecycle-prelock-warning`                   |
| 2 | At lock (or at manual decommission)               | `lifecycle-locked`                            |
| 3 | locked + 30 calendar days                         | `lifecycle-locked-30d`                        |
| 4 | locked + 90 calendar days                         | `lifecycle-locked-90d`                        |
| 5 | locked + 150 days (T-30 to delete)                | `lifecycle-deletion-30d`                      |
| 6 | T-5 business days before delete                   | `lifecycle-deletion-final`                    |
| 7 | After hard delete                                 | `lifecycle-deleted`                           |

Each template takes `{ subjectKind: 'tenant' | 'client', subjectName, scheduledDeleteAt, reactivateUrl }` and renders the right copy/CTA. CTA always points to the right portal sign-in.

For manual decommission, email #1 is skipped and email #2's copy variant says "manually decommissioned by your administrator / by GreenGrass support".

## Technical implementation

### 1. DB migration

```sql
-- Tenants
ALTER TABLE public.tenants
  DROP CONSTRAINT tenants_status_check;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active','suspended','trial','canceled',
                    'inactivity_warned','soft_locked','flagged_for_deletion'));
ALTER TABLE public.tenants
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_reason text,
  ADD COLUMN locked_by uuid,
  ADD COLUMN last_admin_login_at timestamptz,
  ADD COLUMN flagged_for_deletion_at timestamptz,
  ADD COLUMN scheduled_delete_at timestamptz;

-- Customers (client accounts)
ALTER TABLE public.customers
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN locked_reason text,
  ADD COLUMN locked_by uuid,
  ADD COLUMN last_client_login_at timestamptz,
  ADD COLUMN flagged_for_deletion_at timestamptz,
  ADD COLUMN scheduled_delete_at timestamptz;
-- customers.status is currently free text; add CHECK
ALTER TABLE public.customers
  ADD CONSTRAINT customers_status_check
  CHECK (status IN ('ACTIVE','INACTIVE',
                    'inactivity_warned','soft_locked','flagged_for_deletion'));

-- Unified email log
CREATE TABLE public.lifecycle_email_log_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('tenant','client')),
  subject_id uuid NOT NULL,
  cycle_started_at timestamptz NOT NULL,
  step text NOT NULL,                 -- 'prelock' | 'locked' | 'd30' | 'd90' | 'd150' | 'final5bd' | 'deleted'
  recipient_user_id uuid NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_id, cycle_started_at, step, recipient_user_id)
);

-- Deletion audit
CREATE TABLE public.lifecycle_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL,
  subject_id uuid NOT NULL,
  subject_name text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  row_counts jsonb NOT NULL,
  triggered_by text NOT NULL
);

-- Calendar
ALTER TABLE public.global_holidays
  ADD COLUMN observed_in text[] DEFAULT ARRAY['RO']::text[];
-- Seed EU holidays (fixed-date) for the next 5 years; computed dates (Easter-derived) inserted by a one-off function.

CREATE OR REPLACE FUNCTION public.is_business_moment(_at timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  d date := (_at AT TIME ZONE 'Europe/Bucharest')::date;
  hr int := extract(hour FROM (_at AT TIME ZONE 'Europe/Bucharest'));
  dow int := extract(isodow FROM d);  -- 1=Mon..7=Sun
BEGIN
  IF dow >= 6 THEN RETURN false; END IF;
  IF hr < 9 OR hr >= 17 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.global_holidays WHERE date = d) THEN RETURN false; END IF;
  -- Aug 1-15 and Dec 23 - Jan 2 windows
  IF (extract(month FROM d) = 8 AND extract(day FROM d) BETWEEN 1 AND 15) THEN RETURN false; END IF;
  IF (extract(month FROM d) = 12 AND extract(day FROM d) >= 23) OR
     (extract(month FROM d) = 1 AND extract(day FROM d) <= 2) THEN RETURN false; END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.next_business_moment(_from timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  cur timestamptz := _from;
  i int := 0;
BEGIN
  WHILE NOT is_business_moment(cur) AND i < 200 LOOP
    -- jump to 09:00 of the next day in Europe/Bucharest
    cur := (((cur AT TIME ZONE 'Europe/Bucharest')::date + 1) || ' 09:00')::timestamp AT TIME ZONE 'Europe/Bucharest';
    i := i + 1;
  END LOOP;
  RETURN cur;
END $$;

-- Tenant + customer activeness for RLS
CREATE OR REPLACE FUNCTION public.is_tenant_active(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT status NOT IN ('soft_locked','flagged_for_deletion','canceled')
                   FROM public.tenants WHERE id = _tenant_id), true);
$$;
CREATE OR REPLACE FUNCTION public.is_customer_active(_customer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT status NOT IN ('soft_locked','flagged_for_deletion')
                   FROM public.customers WHERE id = _customer_id), true);
$$;
```

Provider RLS policies tightened with `is_tenant_active(tenant_id)`. Client RLS policies (those checking `customer_id = get_user_customer_id(auth.uid())`) tightened with `is_customer_active(customer_id)`.

### 2. Edge functions

- **`tenant-decommission`** / **`tenant-reactivate`** — Super Admin actions on tenants.
- **`client-decommission`** / **`client-reactivate`** — Super Admin actions on customers (NEW).
- **`lifecycle-touch-login`** — invoked from `useAuth.tsx`. Bumps `last_admin_login_at` (provider) or `last_client_login_at` (client) and auto-reactivates if needed.
- **`lifecycle-cron`** — runs hourly; inside, every operation is gated by `is_business_moment(now())`. Walks both `tenants` and `customers`:
  1. `active` → `inactivity_warned` after 180d no-login. Schedule email #1 (defer to next business moment).
  2. `inactivity_warned` → `soft_locked` after 5 business days. Email #2.
  3. Email #3 / #4 / #5 at 30 / 90 / 150 days locked.
  4. `soft_locked` → `flagged_for_deletion` at +150d.
  5. Email #6 at T-5 business days before `scheduled_delete_at`.
  6. Hard-delete when `scheduled_delete_at <= now()` AND state is `flagged_for_deletion` AND it's a business moment. Email #7 from a snapshot of recipients captured pre-delete.
- **`lifecycle-hard-delete`** — wraps SECURITY DEFINER RPCs `hard_delete_tenant(_id)` and `hard_delete_customer(_id)`. Snapshots row counts; deletes child data in dependency order; deletes auth users. For client deletion: removes the `customer` row, all `properties`, `inventory*`, `inspections`, `offers*`, `contracts*`, `service_orders*`, `feedback`, `client_connections`, `activity_log` tied to those properties, plus the linked `auth.users` and `profiles` for that CLIENT_USER. The provider's tenant-side aggregates remain intact (the customer row is deleted; provider sees "former customer — deleted" placeholder where referenced).

### 3. Email templates (Resend, React Email)

Seven shared templates with `subjectKind` discriminator under `supabase/functions/_shared/transactional-email-templates/`. Wired through existing `send-transactional-email` + `process-email-queue`. CTA URL switches between `/auth` (tenant) and `/client` (client portal) based on `subjectKind`.

### 4. In-app notifications

A new `lifecycle_notifications` queue table holds notifications with `not_before timestamptz`. The existing `useNotifications` hook reads only rows where `not_before <= now()`. Any lifecycle event creates one row per relevant user, with `not_before = next_business_moment(now())`. Same gating, no weekend pings.

### 5. Frontend

- **`useAuth.tsx`**: after sign-in → `lifecycle-touch-login`. If subject is locked and the user is not its owner-admin, sign out and route to `/account-locked` (provider) or `/client/account-locked` (client) with countdown to deletion.
- **`/admin/tenants`**: replace direct UPDATE with `tenant-decommission`. Add Reactivate, Delete Now, Pending Deletion filter, last-login column, scheduled-delete countdown.
- **NEW `/admin/clients`**: mirror screen for customer accounts with the same actions.
- **NEW `/admin/lifecycle`**: combined view of `inactivity_warned` + `soft_locked` + `flagged_for_deletion` across both kinds, with next milestone date and a "next email at" column reflecting business-moment gating.
- **NEW `/account-locked`** and **`/client/account-locked`** pages.

### 6. Cron

```sql
SELECT cron.schedule(
  'lifecycle-hourly',
  '15 * * * *',
  $$ select net.http_post(
       url:='https://xmklfvepyiiiurokpvub.supabase.co/functions/v1/lifecycle-cron',
       headers:=jsonb_build_object('Content-Type','application/json',
                                   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='lifecycle_cron_service_role_key')),
       body:='{}'::jsonb) $$);
```

Hourly (not daily) so deferred-to-business-day items fire as soon as the next business hour opens. The cron itself is cheap; all real work is gated.

Backfill: set `last_admin_login_at` from `auth.users.last_sign_in_at` for PROVIDER_ADMIN profiles, and `last_client_login_at` for CLIENT_USER profiles.

### 7. Audit & observability

- All transitions → `super_admin_audit_logs`.
- Hard deletes → `lifecycle_deletion_audit`.
- All emails → `lifecycle_email_log_v2`.
- New `/admin/lifecycle/audit` page lists deletions and aging accounts.

## Out of scope

- No GDPR data-export-on-deletion (could be added).
- No per-tenant override of the EU calendar (one global business calendar).
- No changes to billing / subscription enforcement.

## Risk / rollback

- Every state up to hard delete is reversible via `*-reactivate` functions.
- Hard delete is the only irreversible step; runs only via dedicated function with audit row and only inside a business moment.
- All emails are idempotent on `(subject_kind, subject_id, cycle_started_at, step, recipient_user_id)` — re-running the cron is safe.
- Calendar changes are data, not code: holidays can be added to `global_holidays` without redeploy.