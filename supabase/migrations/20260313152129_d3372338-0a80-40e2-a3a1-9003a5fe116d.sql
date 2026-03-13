
-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE public.app_role AS ENUM ('PROVIDER_ADMIN', 'PROVIDER_STAFF', 'CLIENT_USER');
CREATE TYPE public.inventory_category AS ENUM ('TREE', 'LAWN', 'SHRUB', 'FLOWER_BED', 'OTHER');
CREATE TYPE public.inventory_source AS ENUM ('MANUAL', 'AI_ASSISTED');
CREATE TYPE public.billing_cycle AS ENUM ('WEEKLY', 'MONTHLY', 'ONE_TIME');
CREATE TYPE public.contract_status AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'TERMINATED');
CREATE TYPE public.frequency_type AS ENUM ('PER_VISIT', 'PER_WEEK', 'PER_MONTH', 'ONE_TIME');
CREATE TYPE public.period_type AS ENUM ('WEEK', 'MONTH', 'ONE_TIME');
CREATE TYPE public.service_order_status AS ENUM ('DRAFT', 'SENT_TO_CLIENT', 'CLIENT_APPROVED', 'CLIENT_REJECTED');
CREATE TYPE public.service_order_item_source AS ENUM ('CONTRACT', 'AD_HOC');
CREATE TYPE public.property_status AS ENUM ('active', 'inactive');
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');

-- ============================================
-- UTILITY: updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================
-- USER ROLES (separate from profiles per security guidelines)
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: is provider (admin or staff)
CREATE OR REPLACE FUNCTION public.is_provider(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('PROVIDER_ADMIN', 'PROVIDER_STAFF')
  )
$$;

-- RLS for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Providers can view all roles" ON public.user_roles
  FOR SELECT USING (public.is_provider(auth.uid()));
CREATE POLICY "Provider admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'PROVIDER_ADMIN'));

-- ============================================
-- PROFILES
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  customer_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Providers can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_provider(auth.uid()));

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  billing_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Now add FK from profiles to customers
ALTER TABLE public.profiles ADD CONSTRAINT fk_profiles_customer
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- Helper: get customer_id for a user
CREATE OR REPLACE FUNCTION public.get_user_customer_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.profiles WHERE user_id = _user_id
$$;

-- RLS for customers
CREATE POLICY "Providers can manage all customers" ON public.customers
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their own customer" ON public.customers
  FOR SELECT USING (id = public.get_user_customer_id(auth.uid()));

-- ============================================
-- PROPERTIES
-- ============================================
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  description TEXT,
  geo_lat DOUBLE PRECISION,
  geo_lng DOUBLE PRECISION,
  status property_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage all properties" ON public.properties
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their own properties" ON public.properties
  FOR SELECT USING (customer_id = public.get_user_customer_id(auth.uid()));

-- ============================================
-- INVENTORY
-- ============================================
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  last_ai_update_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage all inventory" ON public.inventory
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their property inventory" ON public.inventory
  FOR SELECT USING (
    property_id IN (SELECT id FROM public.properties WHERE customer_id = public.get_user_customer_id(auth.uid()))
  );

-- ============================================
-- INVENTORY ITEMS
-- ============================================
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  category inventory_category NOT NULL DEFAULT 'OTHER',
  name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  unit TEXT DEFAULT 'count',
  notes TEXT,
  source inventory_source NOT NULL DEFAULT 'MANUAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage all inventory items" ON public.inventory_items
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their inventory items" ON public.inventory_items
  FOR SELECT USING (
    inventory_id IN (
      SELECT i.id FROM public.inventory i
      JOIN public.properties p ON p.id = i.property_id
      WHERE p.customer_id = public.get_user_customer_id(auth.uid())
    )
  );

-- ============================================
-- SERVICE CATALOG
-- ============================================
CREATE TABLE public.service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_unit TEXT DEFAULT 'visit',
  default_price NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_service_catalog_updated_at
  BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage service catalog" ON public.service_catalog
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Authenticated users can view active services" ON public.service_catalog
  FOR SELECT TO authenticated USING (is_active = true);

-- ============================================
-- CONTRACTS
-- ============================================
CREATE TABLE public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contract_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  billing_cycle billing_cycle NOT NULL DEFAULT 'MONTHLY',
  status contract_status NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage all contracts" ON public.contracts
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their contracts" ON public.contracts
  FOR SELECT USING (
    property_id IN (SELECT id FROM public.properties WHERE customer_id = public.get_user_customer_id(auth.uid()))
  );

-- ============================================
-- CONTRACT LINE ITEMS
-- ============================================
CREATE TABLE public.contract_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_catalog_id UUID NOT NULL REFERENCES public.service_catalog(id),
  custom_name TEXT,
  frequency_type frequency_type NOT NULL DEFAULT 'PER_VISIT',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_line_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_contract_line_items_updated_at
  BEFORE UPDATE ON public.contract_line_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage contract line items" ON public.contract_line_items
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their contract line items" ON public.contract_line_items
  FOR SELECT USING (
    contract_id IN (
      SELECT c.id FROM public.contracts c
      JOIN public.properties p ON p.id = c.property_id
      WHERE p.customer_id = public.get_user_customer_id(auth.uid())
    )
  );

-- ============================================
-- SERVICE ORDERS
-- ============================================
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  scheduled_date DATE,
  performed_date DATE,
  period_type period_type NOT NULL DEFAULT 'WEEK',
  period_label TEXT,
  status service_order_status NOT NULL DEFAULT 'DRAFT',
  notes TEXT,
  client_summary TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage all service orders" ON public.service_orders
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their service orders" ON public.service_orders
  FOR SELECT USING (
    property_id IN (SELECT id FROM public.properties WHERE customer_id = public.get_user_customer_id(auth.uid()))
  );
CREATE POLICY "Clients can update service order status" ON public.service_orders
  FOR UPDATE USING (
    property_id IN (SELECT id FROM public.properties WHERE customer_id = public.get_user_customer_id(auth.uid()))
    AND status = 'SENT_TO_CLIENT'
  );

-- ============================================
-- SERVICE ORDER ITEMS
-- ============================================
CREATE TABLE public.service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  contract_line_item_id UUID REFERENCES public.contract_line_items(id) ON DELETE SET NULL,
  service_catalog_id UUID REFERENCES public.service_catalog(id),
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  notes TEXT,
  source service_order_item_source NOT NULL DEFAULT 'CONTRACT',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_service_order_items_updated_at
  BEFORE UPDATE ON public.service_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage service order items" ON public.service_order_items
  FOR ALL USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their service order items" ON public.service_order_items
  FOR SELECT USING (
    service_order_id IN (
      SELECT so.id FROM public.service_orders so
      JOIN public.properties p ON p.id = so.property_id
      WHERE p.customer_id = public.get_user_customer_id(auth.uid())
    )
  );

-- ============================================
-- FEEDBACK
-- ============================================
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id),
  rating_stars INTEGER NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view all feedback" ON public.feedback
  FOR SELECT USING (public.is_provider(auth.uid()));
CREATE POLICY "Clients can create feedback" ON public.feedback
  FOR INSERT WITH CHECK (auth.uid() = customer_user_id);
CREATE POLICY "Clients can view their own feedback" ON public.feedback
  FOR SELECT USING (auth.uid() = customer_user_id);

-- ============================================
-- TASKS (lightweight)
-- ============================================
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status task_status NOT NULL DEFAULT 'pending',
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  service_order_id UUID REFERENCES public.service_orders(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Providers can manage all tasks" ON public.tasks
  FOR ALL USING (public.is_provider(auth.uid()));

-- ============================================
-- ACTIVITY LOG
-- ============================================
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_description TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Providers can view all activity" ON public.activity_log
  FOR SELECT USING (public.is_provider(auth.uid()));
CREATE POLICY "Providers can create activity" ON public.activity_log
  FOR INSERT WITH CHECK (public.is_provider(auth.uid()));
CREATE POLICY "Clients can view their property activity" ON public.activity_log
  FOR SELECT USING (
    property_id IN (SELECT id FROM public.properties WHERE customer_id = public.get_user_customer_id(auth.uid()))
  );

-- ============================================
-- SEED: Service Catalog
-- ============================================
INSERT INTO public.service_catalog (code, name, description, default_unit, default_price) VALUES
  ('LAWN_MOW', 'Lawn Mowing', 'Regular lawn cutting and mowing service', 'm²', 0.15),
  ('LAWN_EDGE', 'Lawn Edging', 'Clean edging along walkways and borders', 'linear_meters', 0.50),
  ('GRASS_AERATE', 'Grass Aeration', 'Core aeration to improve soil health', 'm²', 0.25),
  ('FERTILIZE', 'Fertilizer Application', 'Seasonal fertilizer treatment', 'm²', 0.20),
  ('LEAF_CLEANUP', 'Leaf Cleanup', 'Seasonal leaf removal and disposal', 'visit', 75.00),
  ('TREE_PRUNE', 'Tree Pruning', 'Professional tree trimming and pruning', 'item', 50.00),
  ('HEDGE_TRIM', 'Hedge Trimming', 'Hedge and shrub shaping and trimming', 'linear_meters', 2.00),
  ('WEED_CONTROL', 'Weed Control', 'Weed removal and prevention treatment', 'm²', 0.30),
  ('IRRIGATION', 'Irrigation Inspection', 'Sprinkler system check and maintenance', 'visit', 60.00),
  ('ONE_OFF', 'One-off Cleanup', 'General property cleanup and debris removal', 'visit', 100.00);

-- ============================================
-- Auto-create inventory record when property is created
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventory (property_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_property_created
  AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_property();
