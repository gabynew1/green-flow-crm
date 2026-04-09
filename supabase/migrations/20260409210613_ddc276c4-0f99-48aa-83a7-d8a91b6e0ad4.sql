
-- Create teams table
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Team A',
  color text NOT NULL DEFAULT '#3B82F6',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Add time slot and team columns to service_orders
ALTER TABLE public.service_orders
  ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN scheduled_start_time time WITHOUT TIME ZONE,
  ADD COLUMN scheduled_end_time time WITHOUT TIME ZONE;

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- Teams RLS: providers can view their tenant's teams
CREATE POLICY "Providers can view tenant teams"
  ON public.teams FOR SELECT
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Teams RLS: provider admins can manage teams
CREATE POLICY "Provider admins can manage teams"
  ON public.teams FOR ALL
  TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'PROVIDER_ADMIN'))
  WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'PROVIDER_ADMIN'));

-- Team members RLS: providers can view
CREATE POLICY "Providers can view team members"
  ON public.team_members FOR SELECT
  TO authenticated
  USING (team_id IN (SELECT id FROM public.teams WHERE tenant_id = get_user_tenant_id(auth.uid())));

-- Team members RLS: provider admins can manage
CREATE POLICY "Provider admins can manage team members"
  ON public.team_members FOR ALL
  TO authenticated
  USING (team_id IN (SELECT id FROM public.teams WHERE tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'PROVIDER_ADMIN'))
  WITH CHECK (team_id IN (SELECT id FROM public.teams WHERE tenant_id = get_user_tenant_id(auth.uid())) AND has_role(auth.uid(), 'PROVIDER_ADMIN'));

-- Seed default team for all existing tenants
INSERT INTO public.teams (tenant_id, name, color)
SELECT id, 'Team A', '#3B82F6' FROM public.tenants
WHERE NOT EXISTS (SELECT 1 FROM public.teams WHERE teams.tenant_id = tenants.id);

-- Create trigger function for auto-creating default team on new tenant
CREATE OR REPLACE FUNCTION public.auto_create_default_team()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.teams (tenant_id, name, color)
  VALUES (NEW.id, 'Team A', '#3B82F6');
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER on_tenant_created_create_default_team
  AFTER INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_default_team();
