
CREATE OR REPLACE FUNCTION public.generate_unique_property_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  last_name text;
  prop_name text;
  suffix text;
  final_id text;
  full_name_val text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  SELECT p.full_name INTO full_name_val
  FROM public.profiles p
  WHERE p.customer_id = NEW.customer_id
  LIMIT 1;

  IF full_name_val IS NOT NULL AND full_name_val != '' THEN
    last_name := regexp_replace(split_part(reverse(full_name_val), ' ', 1), '[^a-zA-Z]', '', 'g');
    last_name := reverse(last_name);
  ELSE
    last_name := 'Unknown';
  END IF;

  prop_name := regexp_replace(NEW.name, '[^a-zA-Z0-9 ]', '', 'g');
  prop_name := regexp_replace(prop_name, '\s+', '', 'g');

  -- Generate 4-char alphanumeric suffix
  LOOP
    suffix := '';
    FOR i IN 1..4 LOOP
      suffix := suffix || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    final_id := last_name || '_' || prop_name || '_' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.properties WHERE unique_property_id = final_id AND id != NEW.id);
  END LOOP;

  NEW.unique_property_id := final_id;
  RETURN NEW;
END;
$function$;

-- Regenerate existing IDs with new format
UPDATE public.properties SET name = name;
