
-- Harden SECURITY DEFINER functions: revoke anon EXECUTE on functions that
-- must not run without authentication, keeping public-onboarding lookups open.

-- Helper: revoke from PUBLIC (which includes anon) then grant back to the
-- roles that actually need the function.

-- 1) Trigger-only functions: callers are triggers (table owner), no role grant needed.
DO $$
DECLARE
  fn text;
  trig_fns text[] := ARRAY[
    'public._trg_connections_notify()',
    'public._trg_contract_sent_to_client()',
    'public._trg_contracts_notify()',
    'public._trg_feedback_notify()',
    'public._trg_inspections_notify()',
    'public._trg_offer_sent_to_client()',
    'public._trg_offers_notify()',
    'public.auto_create_default_team()',
    'public.create_tenant_email_settings()',
    'public.handle_new_property()',
    'public.handle_new_user()',
    'public.prevent_profile_privilege_escalation()',
    'public.set_default_trial()',
    'public.sync_email_verified_to_profile()',
    'public.sync_lifecycle_login_timestamps()',
    'public.sync_profile_to_customer()'
  ];
BEGIN
  FOREACH fn IN ARRAY trig_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 2) Admin / service-role-only RPCs: callable only by service_role.
DO $$
DECLARE
  fn text;
  admin_fns text[] := ARRAY[
    'public.admin_discard_dlq(text, bigint)',
    'public.admin_email_activity_stats(timestamptz, timestamptz)',
    'public.admin_email_alerts()',
    'public.admin_email_health()',
    'public.admin_list_dlq(text, integer)',
    'public.admin_list_email_activity(text, text, text, timestamptz, timestamptz, integer, integer)',
    'public.admin_replay_dlq(text, bigint)',
    'public.admin_resend_email(text)',
    'public.apply_tier_limits(uuid, text)',
    'public.delete_email(text, bigint)',
    'public.enqueue_email(text, jsonb)',
    'public.expire_trials_to_patio()',
    'public.extend_trial_15(uuid)',
    'public.fn_expire_trials()',
    'public.fn_record_trial_identities(uuid)',
    'public.get_customer_email_history(uuid, integer, integer)',
    'public.get_email_for_webview(text)',
    'public.hard_delete_customer(uuid, text, text)',
    'public.hard_delete_tenant(uuid, text, text)',
    'public.log_super_admin_action(text, text, uuid, jsonb)',
    'public.move_to_dlq(text, text, bigint, jsonb)',
    'public.purge_old_email_logs()',
    'public.read_email_batch(text, integer, integer)',
    'public.touch_customer_client_login(uuid)',
    'public.touch_tenant_admin_login(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY admin_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- 3) Authenticated-user RPCs: revoke from anon, keep authenticated + service_role.
DO $$
DECLARE
  fn text;
  user_fns text[] := ARRAY[
    'public.act_on_task(uuid, text, text, jsonb)',
    'public.fn_check_trial_eligibility(uuid)',
    'public.fn_get_tenant_entitlements(uuid)',
    'public.generate_client_id()',
    'public.generate_unique_property_id()',
    'public.generate_unique_tenant_id()',
    'public.get_my_email_history(integer, integer, text, timestamptz)',
    'public.get_user_customer_id(uuid)',
    'public.get_user_email(uuid)',
    'public.get_user_tenant_id(uuid)',
    'public.has_role(uuid, app_role)',
    'public.is_provider(uuid)',
    'public.is_super_admin(uuid)',
    'public.is_workday(uuid, date)'
  ];
BEGIN
  FOREACH fn IN ARRAY user_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;

-- 4) Public onboarding/lookup functions: keep anon access (these are intentionally
--    callable pre-login for invite acceptance, tenant code lookup, and email
--    existence checks during signup).
--    No change needed -- explicitly re-grant to be safe / self-documenting.
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_invite_by_token(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_tenant_by_code(text) TO anon, authenticated, service_role;
