REVOKE ALL ON FUNCTION public.fn_generate_invoice_for_contract_cycle(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_generate_invoice_for_contract_cycle(uuid, date) TO authenticated;