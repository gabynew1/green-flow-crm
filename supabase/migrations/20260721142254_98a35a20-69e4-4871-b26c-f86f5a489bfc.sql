ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;