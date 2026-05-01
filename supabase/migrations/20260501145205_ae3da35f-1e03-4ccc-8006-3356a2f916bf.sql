-- Allow clients to create properties before being linked to a provider tenant.
-- The auto-inventory creation should only fire when a tenant is known, otherwise
-- it violates inventory.tenant_id NOT NULL and the whole property insert fails.
CREATE OR REPLACE FUNCTION public.handle_new_property()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.inventory (property_id, tenant_id)
    VALUES (NEW.id, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$function$;