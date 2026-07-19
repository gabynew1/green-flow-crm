
-- 1) Add enum value (safe: function body below uses text cast, deferred)
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'visit_request_new';

-- 2) Trigger function: on new visit_requests row, notify provider admins.
CREATE OR REPLACE FUNCTION public.fn_notify_visit_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_name text;
  v_property_name text;
  v_client_name text;
  v_client_email text;
  v_pa record;
  v_title text;
  v_body  text;
  v_service_key text;
  v_supabase_url text := 'https://xmklfvepyiiiurokpvub.supabase.co';
  v_emailed text[] := ARRAY[]::text[];
  v_recipient_email text;
BEGIN
  IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = NEW.tenant_id;
  SELECT name INTO v_property_name FROM public.properties WHERE id = NEW.property_id;

  SELECT COALESCE(NULLIF(p.full_name,''), p.email, 'client'), p.email
    INTO v_client_name, v_client_email
    FROM public.profiles p WHERE p.user_id = NEW.requested_by_user_id LIMIT 1;

  v_title := 'Cerere nouă de vizită: ' || COALESCE(v_property_name, 'proprietate');
  v_body  := COALESCE(v_client_name,'client')
             || CASE WHEN NEW.preferred_date IS NOT NULL
                     THEN ' · preferă ' || to_char(NEW.preferred_date,'YYYY-MM-DD') ELSE '' END
             || CASE WHEN COALESCE(NEW.description,'') <> ''
                     THEN E'\n' || left(NEW.description, 240) ELSE '' END;

  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_service_key := NULL;
  END;

  FOR v_pa IN
    SELECT ur.user_id, p.email AS pa_email, p.full_name AS pa_name
    FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role::text = 'PROVIDER_ADMIN'
      AND p.tenant_id = NEW.tenant_id
  LOOP
    BEGIN
      INSERT INTO public.user_notifications
        (user_id, tenant_id, kind, title, body, entity_type, entity_id)
      VALUES
        (v_pa.user_id, NEW.tenant_id, 'visit_request_new'::public.notification_kind,
         v_title, v_body, 'visit_request', NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_recipient_email := COALESCE(LOWER(v_pa.pa_email), '');
    IF v_recipient_email = '' OR v_recipient_email = ANY(v_emailed) THEN
      CONTINUE;
    END IF;
    v_emailed := array_append(v_emailed, v_recipient_email);

    IF v_service_key IS NOT NULL THEN
      BEGIN
        PERFORM net.http_post(
          url := v_supabase_url || '/functions/v1/send-transactional-email',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'templateName',   'visit-request-created',
            'recipientEmail', v_recipient_email,
            'tenantId',       NEW.tenant_id,
            'templateData', jsonb_build_object(
              'recipient_name',  COALESCE(v_pa.pa_name, 'echipă'),
              'client_name',     COALESCE(v_client_name, 'client'),
              'client_email',    COALESCE(v_client_email, ''),
              'property_name',   COALESCE(v_property_name, ''),
              'preferred_date',  COALESCE(to_char(NEW.preferred_date,'YYYY-MM-DD'), ''),
              'description',     COALESCE(NEW.description, ''),
              'tenant_name',     COALESCE(v_tenant_name, ''),
              'request_id',      NEW.id
            ),
            'idempotencyKey', 'visit-request-' || NEW.id::text || '-' || v_recipient_email
          )
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_notify_visit_request_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_visit_requests_notify ON public.visit_requests;
CREATE TRIGGER trg_visit_requests_notify
AFTER INSERT ON public.visit_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_notify_visit_request_created();
