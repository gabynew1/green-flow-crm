ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS visit_frequency_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visit_frequency_type text DEFAULT 'WEEK';