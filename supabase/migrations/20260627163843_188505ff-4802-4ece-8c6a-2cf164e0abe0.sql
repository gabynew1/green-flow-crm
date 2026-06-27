
CREATE OR REPLACE FUNCTION public.fn_emit_signup_completed(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_role     text;
  v_tenant_name text;
  v_label    text;
  v_title    text;
  v_body     text;
  v_sa       record;
  v_recipient_email text;
  v_recipient_name  text;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  IF v_profile.id IS NULL THEN
    RETURN;
  END IF;

  SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = p_user_id LIMIT 1;
  v_role := COALESCE(v_role, 'UNKNOWN');

  IF v_profile.tenant_id IS NOT NULL THEN
    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = v_profile.tenant_id;
  END IF;

  IF v_role IN ('PROVIDER_ADMIN','PROVIDER_STAFF') THEN
    v_label := 'New provider account';
  ELSIF v_role = 'CLIENT_USER' THEN
    v_label := 'New client account';
  ELSE
    v_label := 'New account';
  END IF;

  v_title := v_label || ': ' || COALESCE(NULLIF(v_profile.full_name,''), v_profile.email, 'unknown');
  v_body  := COALESCE(v_profile.email,'') ||
             CASE WHEN v_tenant_name IS NOT NULL THEN ' · ' || v_tenant_name ELSE '' END ||
             ' · ' || v_role;

  -- 1) Super admin activity feed entry
  BEGIN
    INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    VALUES (
      p_user_id,
      'new_account_signup',
      'profile',
      v_profile.id,
      jsonb_build_object(
        'profile_id', v_profile.id,
        'user_id',    p_user_id,
        'full_name',  v_profile.full_name,
        'email',      v_profile.email,
        'role',       v_role,
        'tenant_id',  v_profile.tenant_id,
        'tenant_name',v_tenant_name,
        'label',      v_label
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2) Bell notification + 3) email enqueue per super admin
  FOR v_sa IN
    SELECT sa.user_id, p.email AS sa_email, p.full_name AS sa_name
    FROM public.super_admins sa
    LEFT JOIN public.profiles p ON p.user_id = sa.user_id
  LOOP
    BEGIN
      INSERT INTO public.user_notifications (user_id, kind, title, body, entity_type, entity_id)
      VALUES (v_sa.user_id, 'new_signup', v_title, v_body, 'profile', v_profile.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_recipient_email := COALESCE(v_sa.sa_email, '');
    v_recipient_name  := COALESCE(v_sa.sa_name,  '');
    IF v_recipient_email <> '' THEN
      BEGIN
        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'template_name',   'super-admin-new-signup',
            'recipient_email', v_recipient_email,
            'idempotency_key', 'new-signup-' || v_profile.id::text || '-' || v_recipient_email,
            'template_data',   jsonb_build_object(
              'recipientName', v_recipient_name,
              'fullName',      COALESCE(NULLIF(v_profile.full_name,''), 'Unknown'),
              'email',         v_profile.email,
              'role',          v_role,
              'label',         v_label,
              'tenantName',    v_tenant_name,
              'profileId',     v_profile.id,
              'signupAt',      to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_emit_signup_completed(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_emit_signup_completed(uuid) TO service_role;

-- Extend handle_new_user to fan-out the signup event (never blocks signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'CLIENT_USER');

  BEGIN
    PERFORM public.fn_emit_signup_completed(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Never block signup on notification failure
    NULL;
  END;

  RETURN NEW;
END;
$$;
