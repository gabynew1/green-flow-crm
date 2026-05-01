-- 1. Add tenant timezone (default Europe/Bucharest)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Europe/Bucharest';

-- 2. Add notification kind for contract closure
ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'contract_closed';

-- 3. Audit table for contract closures
CREATE TABLE IF NOT EXISTS public.contract_closure_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  closed_by_user_id uuid NOT NULL,
  closed_on_local_date date NOT NULL,
  closed_at_utc timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  canceled_visits_count integer NOT NULL DEFAULT 0,
  canceled_visits_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_closure_events_contract_id
  ON public.contract_closure_events(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_closure_events_tenant_id
  ON public.contract_closure_events(tenant_id);

ALTER TABLE public.contract_closure_events ENABLE ROW LEVEL SECURITY;

-- Append-only audit: SELECT for tenant providers; INSERT only via SECURITY DEFINER RPC
CREATE POLICY "Providers can view tenant closure events"
  ON public.contract_closure_events
  FOR SELECT
  USING (public.is_provider(auth.uid()) AND tenant_id = public.get_user_tenant_id(auth.uid()));
