CREATE OR REPLACE FUNCTION public.log_invoice_payment_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_property_id uuid;
  v_number text;
BEGIN
  SELECT property_id, invoice_number INTO v_property_id, v_number
    FROM public.invoices WHERE id = NEW.invoice_id;

  -- activity_log requires a property; skip logging when the invoice has none.
  IF v_property_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_log (
    property_id, tenant_id, event_type, event_description,
    related_entity_type, related_entity_id, created_by
  ) VALUES (
    v_property_id, NEW.tenant_id, 'invoice_payment_recorded',
    'Plată înregistrată pentru factura ' || COALESCE(v_number, 'draft') ||
      ': ' || NEW.amount::text || ' (' || NEW.method::text || ')',
    'invoice', NEW.invoice_id, NEW.recorded_by_user_id
  );
  RETURN NEW;
END $function$;