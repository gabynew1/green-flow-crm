CREATE OR REPLACE FUNCTION public.set_invoice_payment_recorder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.recorded_by_user_id IS NULL THEN
    NEW.recorded_by_user_id := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_payments_set_recorder ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_set_recorder
BEFORE INSERT ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_payment_recorder();

CREATE OR REPLACE FUNCTION public.lock_invoice_payment_recorder()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id THEN
    RAISE EXCEPTION 'recorded_by_user_id is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_payments_lock_recorder ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_lock_recorder
BEFORE UPDATE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.lock_invoice_payment_recorder();

CREATE OR REPLACE FUNCTION public.log_invoice_payment_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (NEW.tenant_id, NEW.recorded_by_user_id, 'invoice.marked_paid', 'invoice', NEW.invoice_id,
          jsonb_build_object('amount', NEW.amount, 'method', NEW.method, 'payment_id', NEW.id));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_payments_activity_log ON public.invoice_payments;
CREATE TRIGGER trg_invoice_payments_activity_log
AFTER INSERT ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.log_invoice_payment_activity();