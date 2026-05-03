-- ============================================================
-- 1. Tenants: status whitelist + lock metadata
-- ============================================================
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_status_check;

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active','suspended','trial','canceled',
                    'inactivity_warned','soft_locked','flagged_for_deletion'));

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason text,
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS last_admin_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS flagged_for_deletion_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_delete_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tenants_status_locked
  ON public.tenants (status, locked_at);
CREATE INDEX IF NOT EXISTS idx_tenants_scheduled_delete
  ON public.tenants (scheduled_delete_at)
  WHERE scheduled_delete_at IS NOT NULL;

-- ============================================================
-- 2. Customers: status whitelist + lock metadata
-- ============================================================
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_status_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_status_check
  CHECK (status IN ('ACTIVE','INACTIVE','DELETED',
                    'inactivity_warned','soft_locked','flagged_for_deletion'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_reason text,
  ADD COLUMN IF NOT EXISTS locked_by uuid,
  ADD COLUMN IF NOT EXISTS last_client_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS flagged_for_deletion_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_delete_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_customers_status_locked
  ON public.customers (status, locked_at);
CREATE INDEX IF NOT EXISTS idx_customers_scheduled_delete
  ON public.customers (scheduled_delete_at)
  WHERE scheduled_delete_at IS NOT NULL;

-- ============================================================
-- 3. Global holidays: track observers
-- ============================================================
ALTER TABLE public.global_holidays
  ADD COLUMN IF NOT EXISTS observed_in text[] DEFAULT ARRAY['RO']::text[];

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_holidays_date_country
  ON public.global_holidays (date, country_code);

-- ============================================================
-- 4. Lifecycle email log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lifecycle_email_log_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('tenant','client')),
  subject_id uuid NOT NULL,
  cycle_started_at timestamptz NOT NULL,
  step text NOT NULL CHECK (step IN ('prelock','locked','d30','d90','d150','final5bd','deleted','reactivated')),
  recipient_user_id uuid NOT NULL,
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT lifecycle_email_log_v2_unique
    UNIQUE (subject_kind, subject_id, cycle_started_at, step, recipient_user_id)
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_email_log_v2_subject
  ON public.lifecycle_email_log_v2 (subject_kind, subject_id, cycle_started_at);

ALTER TABLE public.lifecycle_email_log_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages lifecycle email log v2"
  ON public.lifecycle_email_log_v2
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Super admins read lifecycle email log v2"
  ON public.lifecycle_email_log_v2
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ============================================================
-- 5. Lifecycle deletion audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lifecycle_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('tenant','client')),
  subject_id uuid NOT NULL,
  subject_name text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_by text NOT NULL CHECK (triggered_by IN ('cron','super_admin'))
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_deletion_audit_subject
  ON public.lifecycle_deletion_audit (subject_kind, deleted_at DESC);

ALTER TABLE public.lifecycle_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role inserts deletion audit"
  ON public.lifecycle_deletion_audit
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Super admins read deletion audit"
  ON public.lifecycle_deletion_audit
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ============================================================
-- 6. Business calendar helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_business_moment(_at timestamptz)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  local_ts timestamp;
  d date;
  hr int;
  dow int;
BEGIN
  local_ts := (_at AT TIME ZONE 'Europe/Bucharest');
  d := local_ts::date;
  hr := extract(hour FROM local_ts)::int;
  dow := extract(isodow FROM d)::int;  -- 1=Mon..7=Sun

  IF dow >= 6 THEN RETURN false; END IF;
  IF hr < 9 OR hr >= 17 THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.global_holidays WHERE date = d) THEN
    RETURN false;
  END IF;

  -- Continental summer shutdown: Aug 1-15
  IF extract(month FROM d) = 8 AND extract(day FROM d) BETWEEN 1 AND 15 THEN
    RETURN false;
  END IF;
  -- Year-end window: Dec 23 - Jan 2
  IF (extract(month FROM d) = 12 AND extract(day FROM d) >= 23)
     OR (extract(month FROM d) = 1 AND extract(day FROM d) <= 2) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_business_moment(_from timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur timestamptz := _from;
  guard int := 0;
  local_ts timestamp;
  next_local timestamp;
BEGIN
  -- If we're already in a business moment, return as-is
  IF public.is_business_moment(cur) THEN
    RETURN cur;
  END IF;

  WHILE guard < 400 LOOP
    local_ts := (cur AT TIME ZONE 'Europe/Bucharest');
    -- If it's same day but before 09:00, snap to today 09:00 local; otherwise jump to next day 09:00
    IF extract(hour FROM local_ts)::int < 9
       AND extract(isodow FROM local_ts::date)::int < 6 THEN
      next_local := (local_ts::date::text || ' 09:00:00')::timestamp;
    ELSE
      next_local := ((local_ts::date + 1)::text || ' 09:00:00')::timestamp;
    END IF;
    cur := next_local AT TIME ZONE 'Europe/Bucharest';
    IF public.is_business_moment(cur) THEN
      RETURN cur;
    END IF;
    guard := guard + 1;
  END LOOP;

  RETURN cur;  -- fallback (shouldn't hit guard in practice)
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_business_moment(timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_business_moment(timestamptz) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.next_business_moment(timestamptz) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.next_business_moment(timestamptz) TO authenticated, service_role;

-- ============================================================
-- 7. Tenant / customer activeness helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_tenant_active(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT status NOT IN ('soft_locked','flagged_for_deletion','canceled')
     FROM public.tenants WHERE id = _tenant_id),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_customer_active(_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT status NOT IN ('soft_locked','flagged_for_deletion','DELETED')
     FROM public.customers WHERE id = _customer_id),
    true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_tenant_active(uuid)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_tenant_active(uuid)   TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_customer_active(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_customer_active(uuid) TO authenticated, service_role;

-- ============================================================
-- 8. Seed EU fixed-date holidays (2026 - 2030)
-- ============================================================
DO $seed$
DECLARE
  yr int;
  fixed_dates jsonb := '[
    ["01-01","New Year''s Day"],
    ["01-06","Epiphany"],
    ["05-01","Labour Day"],
    ["05-09","Europe Day"],
    ["08-15","Assumption of Mary"],
    ["11-01","All Saints'' Day"],
    ["12-24","Christmas Eve"],
    ["12-25","Christmas Day"],
    ["12-26","St. Stephen''s Day"],
    ["12-31","New Year''s Eve"]
  ]'::jsonb;
  entry jsonb;
BEGIN
  FOR yr IN 2026..2030 LOOP
    FOR entry IN SELECT * FROM jsonb_array_elements(fixed_dates) LOOP
      INSERT INTO public.global_holidays (date, name, country_code, observed_in)
      VALUES ((yr || '-' || (entry->>0))::date, entry->>1, 'EU', ARRAY['EU'])
      ON CONFLICT (date, country_code) DO NOTHING;
    END LOOP;
  END LOOP;
END
$seed$;

-- Easter-derived holidays for 2026 - 2030 (Western/Gregorian)
-- Easter Sunday dates verified: 2026-04-05, 2027-03-28, 2028-04-16, 2029-04-01, 2030-04-21
DO $easter$
DECLARE
  easter_sundays date[] := ARRAY['2026-04-05','2027-03-28','2028-04-16','2029-04-01','2030-04-21']::date[];
  e date;
BEGIN
  FOREACH e IN ARRAY easter_sundays LOOP
    INSERT INTO public.global_holidays (date, name, country_code, observed_in) VALUES
      (e - 2, 'Good Friday',    'EU', ARRAY['EU']),
      (e + 1, 'Easter Monday',  'EU', ARRAY['EU']),
      (e + 39,'Ascension Day',  'EU', ARRAY['EU']),
      (e + 50,'Whit Monday',    'EU', ARRAY['EU'])
    ON CONFLICT (date, country_code) DO NOTHING;
  END LOOP;
END
$easter$;

-- ============================================================
-- 9. Backfill last-login timestamps
-- ============================================================
UPDATE public.tenants t
SET last_admin_login_at = sub.max_last_sign_in
FROM (
  SELECT p.tenant_id, max(u.last_sign_in_at) AS max_last_sign_in
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.provider_permission = 'full_admin'
    AND p.tenant_id IS NOT NULL
  GROUP BY p.tenant_id
) sub
WHERE t.id = sub.tenant_id;

UPDATE public.customers c
SET last_client_login_at = sub.max_last_sign_in
FROM (
  SELECT p.customer_id, max(u.last_sign_in_at) AS max_last_sign_in
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE p.customer_id IS NOT NULL
  GROUP BY p.customer_id
) sub
WHERE c.id = sub.customer_id;