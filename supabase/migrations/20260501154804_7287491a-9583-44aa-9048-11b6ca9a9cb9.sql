-- 1) Tighten provider write access on service_catalog so providers can only manage
--    rows that belong to their own tenant. Reading global (tenant_id IS NULL) rows
--    stays unchanged via the existing SELECT policy.
DROP POLICY IF EXISTS "Providers can manage tenant catalog" ON public.service_catalog;

CREATE POLICY "Providers can manage own tenant catalog"
  ON public.service_catalog
  FOR ALL
  TO authenticated
  USING (
    public.is_provider(auth.uid())
    AND tenant_id IS NOT NULL
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  )
  WITH CHECK (
    public.is_provider(auth.uid())
    AND tenant_id IS NOT NULL
    AND tenant_id = public.get_user_tenant_id(auth.uid())
  );

-- Super admins keep full control of the global template.
DROP POLICY IF EXISTS "Super admins can manage global catalog" ON public.service_catalog;
CREATE POLICY "Super admins can manage global catalog"
  ON public.service_catalog
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2) Import RPC: copies every active global service into the caller's tenant,
--    skipping any (code, name) pair the tenant already owns.
CREATE OR REPLACE FUNCTION public.import_default_service_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_imported int := 0;
  v_skipped int := 0;
  v_total_global int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_provider(auth.uid()) THEN
    RAISE EXCEPTION 'Only providers can import the default catalog';
  END IF;

  v_tenant := public.get_user_tenant_id(auth.uid());
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No tenant assigned to current user';
  END IF;

  SELECT count(*) INTO v_total_global
  FROM public.service_catalog WHERE tenant_id IS NULL AND is_active = true;

  WITH inserted AS (
    INSERT INTO public.service_catalog
      (tenant_id, code, name, description, default_unit, default_price, is_active)
    SELECT v_tenant, g.code, g.name, g.description, g.default_unit, g.default_price, true
    FROM public.service_catalog g
    WHERE g.tenant_id IS NULL
      AND g.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM public.service_catalog t
        WHERE t.tenant_id = v_tenant
          AND lower(t.code) = lower(g.code)
          AND lower(t.name) = lower(g.name)
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_imported FROM inserted;

  v_skipped := v_total_global - v_imported;

  RETURN jsonb_build_object(
    'imported', v_imported,
    'skipped', v_skipped,
    'total', v_total_global
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_default_service_catalog() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_default_service_catalog() TO authenticated;