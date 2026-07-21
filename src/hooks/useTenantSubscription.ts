import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TenantSubscription {
  id: string;
  name: string;
  subscription_tier: string;
  trial_expires_at: string | null;
  subscription_status: "trial_active" | "grace" | "active" | "downgraded" | "suspended" | "cancelled";
  grace_ends_at: string | null;
  max_teams: number;
  max_provider_seats: number;
  ai_tier: "none" | "standard" | "advanced" | "full";
  created_at: string;
}

export function useTenantSubscription() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  return useQuery({
    queryKey: ["tenant-subscription", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantSubscription | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, subscription_tier, trial_expires_at, subscription_status, grace_ends_at, max_teams, max_provider_seats, ai_tier, created_at")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as TenantSubscription | null;
    },
    staleTime: 30_000,
  });
}