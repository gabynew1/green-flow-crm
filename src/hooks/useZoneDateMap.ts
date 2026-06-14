import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import type { ZoneDateMap } from "@/lib/schedule-engine";

/**
 * Builds an in-memory ZoneDateMap of zone occupancy per team per future day.
 * NOTE: the returned Map contains Set<string> values and must never be serialized
 * or sent to Supabase. Invalidate prefix ['zone-date-map'] after scheduling writes.
 */
export function useZoneDateMap(): ZoneDateMap {
  const { profile } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["zone-date-map", today],
    enabled: !!profile?.tenant_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("team_id, scheduled_date, status, properties(zone_id)")
        .eq("tenant_id", profile!.tenant_id!)
        .in("status", ["SCHEDULED", "IN_PROGRESS"])
        .gte("scheduled_date", today);
      if (error) throw error;
      return data ?? [];
    },
  });

  return useMemo(() => {
    const map: ZoneDateMap = {};
    for (const v of (data ?? []) as any[]) {
      const zoneId = v?.properties?.zone_id as string | null | undefined;
      if (!zoneId || !v.team_id || !v.scheduled_date) continue;
      const key = `${v.scheduled_date}_${v.team_id}`;
      if (!map[key]) map[key] = new Set<string>();
      map[key].add(zoneId);
    }
    return map;
  }, [data]);
}