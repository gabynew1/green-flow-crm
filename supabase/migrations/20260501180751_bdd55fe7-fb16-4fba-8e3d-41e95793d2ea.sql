-- Rebuild billing_cycle enum: drop unused WEEKLY, add YEARLY
-- Final values: MONTHLY, YEARLY, ONE_TIME

-- 1. Create new enum
CREATE TYPE billing_cycle_new AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME');

-- 2. Drop default temporarily so we can change column type
ALTER TABLE public.contracts ALTER COLUMN billing_cycle DROP DEFAULT;

-- 3. Migrate any WEEKLY rows to MONTHLY (defensive — none currently)
UPDATE public.contracts SET billing_cycle = 'MONTHLY' WHERE billing_cycle::text = 'WEEKLY';

-- 4. Convert column to new enum
ALTER TABLE public.contracts
  ALTER COLUMN billing_cycle TYPE billing_cycle_new
  USING billing_cycle::text::billing_cycle_new;

-- 5. Drop old enum and rename new one
DROP TYPE billing_cycle;
ALTER TYPE billing_cycle_new RENAME TO billing_cycle;

-- 6. Restore default
ALTER TABLE public.contracts
  ALTER COLUMN billing_cycle SET DEFAULT 'MONTHLY'::billing_cycle;