
CREATE OR REPLACE FUNCTION public.fn_trial_hash(p_kind text, p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE v text;
BEGIN
  v := public.fn_trial_normalise(p_kind, p_value);
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN md5('gg-trial:' || p_kind || ':' || v);
END $$;
