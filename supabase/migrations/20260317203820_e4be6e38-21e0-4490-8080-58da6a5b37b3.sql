
-- Add unique_tenant_id to tenants
ALTER TABLE tenants ADD COLUMN unique_tenant_id text UNIQUE;

-- Function to generate unique tenant ID on insert
CREATE OR REPLACE FUNCTION public.generate_unique_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  IF NEW.unique_tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    new_id := 'GP-';
    FOR i IN 1..6 LOOP
      new_id := new_id || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM tenants WHERE unique_tenant_id = new_id);
  END LOOP;
  NEW.unique_tenant_id := new_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_unique_tenant_id
  BEFORE INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.generate_unique_tenant_id();

-- Add tenant_id to properties for provider connection
ALTER TABLE properties ADD COLUMN tenant_id uuid REFERENCES tenants(id);

-- Allow anyone (including anon) to look up tenant by unique_tenant_id for invite flow
CREATE POLICY "Anyone can lookup tenant by unique_id"
ON tenants FOR SELECT
TO authenticated
USING (true);

-- Allow clients to update their own properties tenant_id
CREATE POLICY "Clients can update property tenant_id"
ON properties FOR UPDATE
TO authenticated
USING (customer_id = get_user_customer_id(auth.uid()))
WITH CHECK (customer_id = get_user_customer_id(auth.uid()));

-- Allow clients to insert connection requests
CREATE POLICY "Clients can insert connections"
ON client_connections FOR INSERT
TO authenticated
WITH CHECK (client_user_id = auth.uid());
