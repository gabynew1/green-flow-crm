ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_general boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS properties_one_general_per_customer
  ON public.properties (customer_id) WHERE is_general;

CREATE OR REPLACE FUNCTION public.fn_get_or_create_general_property(_customer_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_caller_tenant uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.customers WHERE id = _customer_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'customer not found';
  END IF;

  v_caller_tenant := public.get_user_tenant_id(auth.uid());
  IF v_caller_tenant IS DISTINCT FROM v_tenant OR NOT public.is_provider(auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT id INTO v_id
  FROM public.properties
  WHERE customer_id = _customer_id AND is_general
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.properties (customer_id, tenant_id, name, status, description, is_general)
  VALUES (_customer_id, v_tenant, 'General / No specific location', 'active',
          'Placeholder location for ad-hoc services not tied to a specific site.', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_get_or_create_general_property(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_or_create_general_property(uuid) TO authenticated;