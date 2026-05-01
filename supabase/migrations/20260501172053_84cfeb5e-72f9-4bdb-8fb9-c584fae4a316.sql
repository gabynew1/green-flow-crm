ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inventory_marked_complete_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_marked_complete_by uuid;