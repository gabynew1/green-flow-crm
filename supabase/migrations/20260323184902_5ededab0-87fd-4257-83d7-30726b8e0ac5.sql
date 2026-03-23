ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS cnp text,
  ADD COLUMN IF NOT EXISTS vat_id text,
  ADD COLUMN IF NOT EXISTS address_county text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS fiscal_representative text;