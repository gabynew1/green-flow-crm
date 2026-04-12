import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CurrencyCode } from "@/lib/currency";
import { useAuth } from "@/hooks/useAuth";

export function useTenantCurrency(): CurrencyCode {
  const { tenantId } = useAuth();
  const [currency, setCurrency] = useState<CurrencyCode>("RON");

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("tenants")
      .select("currency")
      .eq("id", tenantId)
      .single()
      .then(({ data }) => {
        if (data?.currency) setCurrency(data.currency as CurrencyCode);
      });
  }, [tenantId]);

  return currency;
}
