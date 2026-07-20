
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;

GRANT EXECUTE ON FUNCTION public.get_customer_email_history(uuid, integer, integer) TO authenticated;

ALTER TABLE public.service_zones ADD COLUMN IF NOT EXISTS description text;
