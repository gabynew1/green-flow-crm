ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES public.properties(id) ON DELETE SET NULL;