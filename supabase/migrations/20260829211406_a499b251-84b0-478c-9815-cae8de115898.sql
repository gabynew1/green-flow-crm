CREATE OR REPLACE FUNCTION public.verify_email_queue_key(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_key text;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN RETURN false; END IF;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  RETURN v_key IS NOT NULL AND v_key = _token;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_email_queue_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_email_queue_key(text) TO service_role;