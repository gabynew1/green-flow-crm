
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
  v_service_key text;
  v_supabase_url text := 'https://xmklfvepyiiiurokpvub.supabase.co';
  v_emailed text[] := ARRAY[]::text[];
  v_extra_email text := 'gabriel@zealot.ro';
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

  BEGIN
    INSERT INTO public.super_admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
    VALUES (
      p_user_id, 'new_account_signup', 'profile', v_profile.id,
      jsonb_build_object(
        'profile_id', v_profile.id, 'user_id', p_user_id,
        'full_name',  v_profile.full_name, 'email', v_profile.email,
        'role', v_role, 'tenant_id', v_profile.tenant_id,
        'tenant_name', v_tenant_name, 'label', v_label
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_service_key := NULL;
  END;

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

    v_recipient_email := COALESCE(LOWER(v_sa.sa_email), '');
    v_recipient_name  := COALESCE(v_sa.sa_name,  '');
    IF v_recipient_email <> '' AND v_service_key IS NOT NULL AND NOT (v_recipient_email = ANY(v_emailed)) THEN
      BEGIN
        PERFORM net.http_post(
          url := v_supabase_url || '/functions/v1/send-transactional-email',
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_key),
          body := jsonb_build_object(
            'templateName','super-admin-new-signup',
            'recipientEmail', v_recipient_email,
            'idempotencyKey', 'new-signup-' || v_profile.id::text || '-' || v_recipient_email,
            'templateData', jsonb_build_object(
              'recipientName', v_recipient_name, 'fullName', COALESCE(NULLIF(v_profile.full_name,''),'Necunoscut'),
              'email', v_profile.email, 'role', v_role, 'label', v_label, 'tenantName', v_tenant_name,
              'profileId', v_profile.id,
              'signupAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
          )
        );
        v_emailed := array_append(v_emailed, v_recipient_email);
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  -- Guaranteed recipient
  IF v_service_key IS NOT NULL AND NOT (LOWER(v_extra_email) = ANY(v_emailed)) THEN
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/send-transactional-email',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_key),
        body := jsonb_build_object(
          'templateName','super-admin-new-signup',
          'recipientEmail', v_extra_email,
          'idempotencyKey', 'new-signup-' || v_profile.id::text || '-' || LOWER(v_extra_email),
          'templateData', jsonb_build_object(
            'recipientName','Gabriel','fullName', COALESCE(NULLIF(v_profile.full_name,''),'Necunoscut'),
            'email', v_profile.email,'role', v_role,'label', v_label,'tenantName', v_tenant_name,
            'profileId', v_profile.id,
            'signupAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END;
$$;
