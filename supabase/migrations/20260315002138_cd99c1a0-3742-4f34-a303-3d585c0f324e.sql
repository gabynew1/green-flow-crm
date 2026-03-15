
-- Trigger function: sync profile changes to linked customer record
CREATE OR REPLACE FUNCTION public.sync_profile_to_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET contact_person_name = NEW.full_name,
        email = NEW.email,
        phone = NEW.phone
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER trg_sync_profile_to_customer
AFTER UPDATE OF full_name, email, phone ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_to_customer();

-- One-time backfill: sync existing profile data into customers
UPDATE public.customers c
SET contact_person_name = p.full_name,
    email = p.email,
    phone = p.phone
FROM public.profiles p
WHERE p.customer_id = c.id
  AND p.customer_id IS NOT NULL;
