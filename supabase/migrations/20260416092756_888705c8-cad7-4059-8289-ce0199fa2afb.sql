
ALTER TABLE public.customers ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE public.properties ALTER COLUMN tenant_id DROP NOT NULL;
