import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Realtime count of pending visit_requests for the current tenant.
 * Used to badge the "Visit Requests" sidebar item.
 */
export function usePendingVisitRequestCount() {
  const { tenantId } = useAuth();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!tenantId) { setCount(0); return; }
    const { count: c } = await supabase
      .from("visit_requests")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending");
    setCount(c ?? 0);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`vr-pending-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visit_requests", filter: `tenant_id=eq.${tenantId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, load]);

  return count;
}