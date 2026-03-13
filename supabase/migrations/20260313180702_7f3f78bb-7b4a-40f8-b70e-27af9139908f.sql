
-- Add new values to contract_status enum
ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'PENDING_NEW';
ALTER TYPE public.contract_status ADD VALUE IF NOT EXISTS 'REJECTED';

-- Add rejection comment column
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS rejection_comment text;
