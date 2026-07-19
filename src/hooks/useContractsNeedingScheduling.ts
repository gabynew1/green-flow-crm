import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ContractNeedingScheduling {
  id: string;
  contract_name: string;
  property_name: string | null;
  customer_name: string | null;
  last_scheduled_date: string | null;
}

/**
 * Lists active contracts that have NO visit scheduled in the next 7 days.
 * Runs client-side over service_orders; tenant-scoped via profile.
 */
export function useContractsNeedingScheduling() {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<ContractNeedingScheduling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const sevenOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, contract_name, properties(name, customers(name))")
        .eq("tenant_id", tenantId)
        .eq("status", "ACTIVE");

      const active = contracts ?? [];
      if (active.length === 0) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }

      const ids = active.map(c => c.id);
      const { data: upcoming } = await supabase
        .from("service_orders")
        .select("contract_id, scheduled_date")
        .in("contract_id", ids)
        .gte("scheduled_date", today)
        .lte("scheduled_date", sevenOut)
        .not("status", "in", "(CANCELED)");

      const covered = new Set((upcoming ?? []).map(u => u.contract_id));

      const { data: lastVisits } = await supabase
        .from("service_orders")
        .select("contract_id, scheduled_date")
        .in("contract_id", ids)
        .order("scheduled_date", { ascending: false });
      const lastByContract: Record<string, string> = {};
      for (const v of lastVisits ?? []) {
        if (v.contract_id && !lastByContract[v.contract_id]) {
          lastByContract[v.contract_id] = v.scheduled_date;
        }
      }

      const result: ContractNeedingScheduling[] = active
        .filter(c => !covered.has(c.id))
        .map(c => ({
          id: c.id,
          contract_name: c.contract_name,
          property_name: (c.properties as any)?.name ?? null,
          customer_name: (c.properties as any)?.customers?.name ?? null,
          last_scheduled_date: lastByContract[c.id] ?? null,
        }));

      if (!cancelled) { setRows(result); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  return { rows, loading };
}