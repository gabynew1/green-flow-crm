import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to postgres_changes on one or more tables and trigger a debounced
 * refresh callback whenever any matching row changes. Filters by tenant_id when
 * provided so subscriptions stay scoped to the current tenant.
 */
export function useRealtimeRefresh(
  tables: string[],
  onChange: () => void,
  tenantId?: string | null,
  debounceMs = 250
) {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!tables.length) return;

    const channelName = `realtime-refresh-${tables.join("-")}-${tenantId ?? "all"}-${Math.random().toString(36).slice(2, 8)}`;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        cbRef.current();
      }, debounceMs);
    };

    let channel = supabase.channel(channelName);
    for (const table of tables) {
      const cfg: any = { event: "*", schema: "public", table };
      if (tenantId) cfg.filter = `tenant_id=eq.${tenantId}`;
      channel = channel.on("postgres_changes", cfg, trigger);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join("|"), tenantId, debounceMs]);
}

export default useRealtimeRefresh;