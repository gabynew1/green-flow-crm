
CREATE OR REPLACE FUNCTION public.fn_change_subscription_tier(
  p_tenant_id uuid,
  p_new_tier text
) RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_super boolean;
  v_old_tier text;
  v_max_teams int;
  v_max_seats int;
  v_ai_tier text;
  v_row public.tenants;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_new_tier NOT IN ('patio','backyard','estate','territory') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_new_tier USING ERRCODE = '22023';
  END IF;

  SELECT public.is_super_admin(v_uid) INTO v_is_super;

  SELECT EXISTS(
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.user_id = v_uid
      AND ur.role = 'PROVIDER_ADMIN'
      AND p.tenant_id = p_tenant_id
  ) INTO v_is_admin;

  IF NOT (v_is_admin OR COALESCE(v_is_super, false)) THEN
    RAISE EXCEPTION 'Only provider admins can change the subscription tier' USING ERRCODE = '42501';
  END IF;

  -- Canonical tier -> limits mapping. Mirror of src/lib/tiers.ts.
  CASE p_new_tier
    WHEN 'patio'     THEN v_max_teams := 0;   v_max_seats := 1; v_ai_tier := 'none';
    WHEN 'backyard'  THEN v_max_teams := 2;   v_max_seats := 2; v_ai_tier := 'standard';
    WHEN 'estate'    THEN v_max_teams := 5;   v_max_seats := 2; v_ai_tier := 'advanced';
    WHEN 'territory' THEN v_max_teams := 999; v_max_seats := 2; v_ai_tier := 'full';
  END CASE;

  SELECT subscription_tier INTO v_old_tier FROM public.tenants WHERE id = p_tenant_id;

  UPDATE public.tenants
  SET subscription_tier = p_new_tier,
      max_teams = v_max_teams,
      max_provider_seats = v_max_seats,
      ai_tier = v_ai_tier,
      trial_expires_at = CASE WHEN v_old_tier = 'territory_trial' THEN NULL ELSE trial_expires_at END,
      updated_at = now()
  WHERE id = p_tenant_id
  RETURNING * INTO v_row;

  INSERT INTO public.activity_log (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_tenant_id, v_uid, 'TIER_CHANGED', 'tenant', p_tenant_id,
    jsonb_build_object('old_tier', v_old_tier, 'new_tier', p_new_tier)
  );

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_change_subscription_tier(uuid, text) TO authenticated;
