
-- Add unique_property_id column
ALTER TABLE public.properties ADD COLUMN unique_property_id text UNIQUE;

-- Function to generate unique_property_id
CREATE OR REPLACE FUNCTION public.generate_unique_property_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  last_name text;
  prop_name text;
  base_id text;
  final_id text;
  counter int := 0;
  full_name_val text;
BEGIN
  -- Get the client's full_name from profiles via customer_id
  SELECT p.full_name INTO full_name_val
  FROM public.profiles p
  WHERE p.customer_id = NEW.customer_id
  LIMIT 1;

  -- Extract last name (last word), default to 'Unknown'
  IF full_name_val IS NOT NULL AND full_name_val != '' THEN
    last_name := regexp_replace(split_part(reverse(full_name_val), ' ', 1), '[^a-zA-Z]', '', 'g');
    last_name := reverse(last_name);
  ELSE
    last_name := 'Unknown';
  END IF;

  -- Clean property name: remove non-alphanumeric, replace spaces with nothing
  prop_name := regexp_replace(NEW.name, '[^a-zA-Z0-9 ]', '', 'g');
  prop_name := regexp_replace(prop_name, '\s+', '', 'g');

  base_id := last_name || '_' || prop_name;
  final_id := base_id;

  -- Handle collisions
  WHILE EXISTS (SELECT 1 FROM public.properties WHERE unique_property_id = final_id AND id != NEW.id) LOOP
    counter := counter + 1;
    final_id := base_id || '_' || counter;
  END LOOP;

  NEW.unique_property_id := final_id;
  RETURN NEW;
END;
$function$;

-- Create trigger
CREATE TRIGGER trg_generate_unique_property_id
  BEFORE INSERT OR UPDATE OF name, customer_id ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_unique_property_id();

-- Backfill existing properties
UPDATE public.properties SET name = name WHERE unique_property_id IS NULL;
