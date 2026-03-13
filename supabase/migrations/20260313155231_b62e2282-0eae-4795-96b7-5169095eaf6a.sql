
-- 1. Create connection_status enum
CREATE TYPE public.connection_status AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- 2. Create tenants table
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'New Tenant',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- 3. Create provider_invites table
CREATE TABLE public.provider_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  created_by uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'PROVIDER_STAFF',
  used_by uuid,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_invites ENABLE ROW LEVEL SECURITY;

-- 4. Create client_connections table
CREATE TABLE public.client_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  client_user_id uuid NOT NULL,
  status public.connection_status NOT NULL DEFAULT 'PENDING',
  provider_name text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
ALTER TABLE public.client_connections ENABLE ROW LEVEL SECURITY;

-- 5. Alter profiles: add unique_client_id and tenant_id
ALTER TABLE public.profiles ADD COLUMN unique_client_id text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- 6. Alter customers: add tenant_id (nullable for now, existing rows have none)
ALTER TABLE public.customers ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- 7. Alter service_catalog: add tenant_id
ALTER TABLE public.service_catalog ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);

-- 8. Function: generate unique client ID on profile insert
CREATE OR REPLACE FUNCTION public.generate_client_id()
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
  LOOP
    new_id := 'GC-';
    FOR i IN 1..6 LOOP
      new_id := new_id || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE unique_client_id = new_id);
  END LOOP;
  NEW.unique_client_id := new_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_generate_client_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_client_id();

-- 9. Update handle_new_user to also assign CLIENT_USER role by default
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'CLIENT_USER');
  
  RETURN NEW;
END;
$$;

-- 10. Function: get_user_tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = _user_id
$$;

-- 11. Function: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND email = 'sidor.gabriel@gmail.com'
  )
$$;

-- 12. RLS: tenants
CREATE POLICY "Providers can view their tenant" ON public.tenants
  FOR SELECT USING (id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Super admin can manage tenants" ON public.tenants
  FOR ALL USING (is_super_admin(auth.uid()));

-- 13. RLS: provider_invites
CREATE POLICY "Super admin can manage invites" ON public.provider_invites
  FOR ALL USING (is_super_admin(auth.uid()));
CREATE POLICY "Anyone can read invite by token" ON public.provider_invites
  FOR SELECT USING (true);

-- 14. RLS: client_connections
CREATE POLICY "Clients can view their connections" ON public.client_connections
  FOR SELECT USING (client_user_id = auth.uid());
CREATE POLICY "Clients can update their connections" ON public.client_connections
  FOR UPDATE USING (client_user_id = auth.uid());
CREATE POLICY "Providers can view tenant connections" ON public.client_connections
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));
CREATE POLICY "Providers can insert connections" ON public.client_connections
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- 15. Update customers RLS: scope providers to their tenant
DROP POLICY "Providers can manage all customers" ON public.customers;
CREATE POLICY "Providers can manage tenant customers" ON public.customers
  FOR ALL USING (is_provider(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL));

-- 16. Update service_catalog RLS: scope to tenant
DROP POLICY "Providers can manage service catalog" ON public.service_catalog;
CREATE POLICY "Providers can manage tenant catalog" ON public.service_catalog
  FOR ALL USING (is_provider(auth.uid()) AND (tenant_id = get_user_tenant_id(auth.uid()) OR tenant_id IS NULL));

-- 17. Backfill unique_client_id for existing profiles that don't have one
UPDATE public.profiles SET unique_client_id = 'GC-' || substr(md5(random()::text), 1, 6) WHERE unique_client_id IS NULL;

-- 18. updated_at triggers for new tables
CREATE TRIGGER set_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
