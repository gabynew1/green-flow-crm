
DO $$
DECLARE
  v_trimmed_ids uuid[];
  v_tenant record;
BEGIN
  WITH ranked AS (
    SELECT so.id,
           row_number() OVER (
             PARTITION BY so.contract_id
             ORDER BY so.scheduled_date, so.scheduled_start_time NULLS LAST, so.id
           ) AS rn
    FROM public.service_orders so
    JOIN public.contracts c ON c.id = so.contract_id
    WHERE so.status = 'SCHEDULED'
      AND so.scheduled_date > current_date
      AND c.status = 'ACTIVE'
      AND so.contract_id IS NOT NULL
  )
  SELECT array_agg(id) INTO v_trimmed_ids FROM ranked WHERE rn > 1;

  IF v_trimmed_ids IS NULL OR array_length(v_trimmed_ids, 1) = 0 THEN
    RAISE NOTICE 'simple-scheduling backfill: nothing to trim';
    RETURN;
  END IF;

  UPDATE public.service_orders
     SET status = 'CANCELED',
         notes  = coalesce(notes, '') ||
                  E'\n[auto-trimmed on migration to simple scheduling – ' ||
                  to_char(now(), 'YYYY-MM-DD') || ']'
   WHERE id = ANY(v_trimmed_ids);

  INSERT INTO public.activity_log
    (property_id, event_type, event_description, related_entity_type, related_entity_id, tenant_id)
  SELECT DISTINCT
         so.property_id,
         'SCHEDULE_SIMPLIFIED',
         'Extra pre-generated visits were canceled during the simple-scheduling migration. Only the next upcoming visit was kept.',
         'contract',
         so.contract_id,
         so.tenant_id
    FROM public.service_orders so
   WHERE so.id = ANY(v_trimmed_ids);

  FOR v_tenant IN
    SELECT so.tenant_id, count(*) AS trimmed_count
      FROM public.service_orders so
     WHERE so.id = ANY(v_trimmed_ids)
     GROUP BY so.tenant_id
  LOOP
    INSERT INTO public.user_notifications
      (tenant_id, user_id, kind, title, body, entity_type, entity_id)
    SELECT v_tenant.tenant_id,
           ur.user_id,
           'schedule_simplified'::notification_kind,
           'Scheduling was simplified',
           v_tenant.trimmed_count ||
           ' extra pre-generated visit(s) were canceled. Only the next upcoming visit per contract was kept. Use "Generate next 30 days" on a contract when you''re ready to plan further.',
           'contract',
           NULL
      FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
     WHERE ur.role = 'PROVIDER_ADMIN'
       AND p.tenant_id = v_tenant.tenant_id;
  END LOOP;
END $$;
