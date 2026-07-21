
ALTER TABLE public.contract_line_items
  ADD COLUMN IF NOT EXISTS is_included_in_base_fee boolean NOT NULL DEFAULT false;

UPDATE public.contract_line_items
  SET is_included_in_base_fee = true
  WHERE unit_price IS NULL AND is_included_in_base_fee = false;

ALTER TABLE public.offer_line_items
  ADD COLUMN IF NOT EXISTS is_included_in_base_fee boolean NOT NULL DEFAULT false;

UPDATE public.offer_line_items
  SET is_included_in_base_fee = true
  WHERE unit_price IS NULL AND is_included_in_base_fee = false;
