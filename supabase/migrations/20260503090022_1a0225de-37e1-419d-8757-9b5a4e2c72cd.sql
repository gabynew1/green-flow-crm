-- Add lifecycle preference to per-user email preferences
ALTER TABLE public.user_email_preferences
  ADD COLUMN IF NOT EXISTS cat_lifecycle_enabled boolean NOT NULL DEFAULT true;

-- Update email_send_allowed to handle the lifecycle category
CREATE OR REPLACE FUNCTION public.email_send_allowed(_email text, _category text, _tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_required BOOLEAN;
  _tenant_enabled BOOLEAN := true;
  _user_enabled BOOLEAN := true;
BEGIN
  -- Unknown categories: allow (fail-open for legacy templates)
  SELECT is_required INTO _is_required FROM public.email_categories WHERE key = _category;
  IF _is_required IS NULL THEN
    RETURN true;
  END IF;

  -- Tenant kill switch (skipped if no tenant context)
  IF _tenant_id IS NOT NULL THEN
    SELECT
      CASE _category
        WHEN 'account'          THEN cat_account_enabled
        WHEN 'visits'           THEN cat_visits_enabled
        WHEN 'contracts_offers' THEN cat_contracts_offers_enabled
        WHEN 'inspections'      THEN cat_inspections_enabled
        WHEN 'lifecycle'        THEN cat_onboarding_enabled
        ELSE true
      END
    INTO _tenant_enabled
    FROM public.tenant_email_settings
    WHERE tenant_id = _tenant_id;

    IF _tenant_enabled IS NULL THEN _tenant_enabled := true; END IF;
    IF _tenant_enabled = false THEN RETURN false; END IF;
  END IF;

  -- Required categories bypass user preferences
  IF _is_required THEN RETURN true; END IF;

  -- User preference
  SELECT
    CASE _category
      WHEN 'visits'           THEN cat_visits_enabled
      WHEN 'contracts_offers' THEN cat_contracts_offers_enabled
      WHEN 'inspections'      THEN cat_inspections_enabled
      WHEN 'lifecycle'        THEN cat_lifecycle_enabled
      ELSE true
    END
  INTO _user_enabled
  FROM public.user_email_preferences
  WHERE lower(email) = lower(_email);

  IF _user_enabled IS NULL THEN RETURN true; END IF;
  RETURN _user_enabled;
END;
$function$;