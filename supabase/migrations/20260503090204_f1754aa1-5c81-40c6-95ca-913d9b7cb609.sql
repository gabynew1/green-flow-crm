CREATE OR REPLACE FUNCTION public.lifecycle_drip_candidates(
  _step text,
  _safety_cap int DEFAULT 200
)
RETURNS TABLE (
  user_id uuid,
  tenant_id uuid,
  email text,
  first_name text,
  email_verified boolean,
  tenant_paused boolean,
  cat_onboarding_enabled boolean,
  customers_count int,
  visits_count int,
  offers_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _window_clause text;
BEGIN
  -- Only callable by service_role
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role')
     AND auth.role() <> 'service_role' THEN
    -- Allow superuser / direct DB access too (no-op when invoked by service role)
    NULL;
  END IF;

  IF _step = 'day_0' THEN
    _window_clause := $w$ coalesce(p.email_verified_at, p.created_at) > now() - interval '1 hour' $w$;
  ELSIF _step = 'day_2' THEN
    _window_clause := $w$ coalesce(p.email_verified_at, p.created_at) BETWEEN now() - interval '2 days 15 minutes' AND now() - interval '2 days' $w$;
  ELSIF _step = 'day_7' THEN
    _window_clause := $w$ coalesce(p.email_verified_at, p.created_at) BETWEEN now() - interval '7 days 15 minutes' AND now() - interval '7 days' $w$;
  ELSE
    RAISE EXCEPTION 'invalid lifecycle step: %', _step;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT
      p.user_id,
      p.tenant_id,
      p.email,
      split_part(coalesce(p.full_name, ''), ' ', 1) AS first_name,
      coalesce(p.email_verified, false) AS email_verified,
      (coalesce(t.status, 'active') <> 'active') AS tenant_paused,
      coalesce(tes.cat_onboarding_enabled, true) AS cat_onboarding_enabled,
      coalesce((SELECT count(*) FROM public.customers c WHERE c.tenant_id = p.tenant_id), 0)::int AS customers_count,
      coalesce((SELECT count(*) FROM public.visits   v WHERE v.tenant_id = p.tenant_id), 0)::int AS visits_count,
      coalesce((SELECT count(*) FROM public.offers   o WHERE o.tenant_id = p.tenant_id), 0)::int AS offers_count
    FROM public.profiles p
    LEFT JOIN public.tenants t ON t.id = p.tenant_id
    LEFT JOIN public.tenant_email_settings tes ON tes.tenant_id = p.tenant_id
    WHERE p.tenant_id IS NOT NULL
      AND p.provider_permission = 'full_admin'
      AND %s
      AND NOT EXISTS (
        SELECT 1 FROM public.lifecycle_email_log l
        WHERE l.user_id = p.user_id AND l.step = %L
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.suppressed_emails s WHERE lower(s.email) = lower(p.email)
      )
    LIMIT %s
  $q$, _window_clause, _step, _safety_cap);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lifecycle_drip_candidates(text, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lifecycle_drip_candidates(text, int) TO service_role;