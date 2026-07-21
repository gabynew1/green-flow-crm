import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type EntitlementValue = number | boolean | string;

export interface EntitlementsPayload {
  tier: string;
  effective_tier?: string;
  subscription_status?: "trial_active" | "grace" | "active" | "downgraded" | "suspended" | "cancelled";
  grace_ends_at?: string | null;
  trial_expires_at?: string | null;
  entitlements: Record<string, EntitlementValue>;
}

const UNLIMITED_SENTINEL = 999;

export function useEntitlements() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id ?? null;

  const q = useQuery({
    queryKey: ["entitlements", tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<EntitlementsPayload | null> => {
      if (!tenantId) return null;
      const { data, error } = await supabase.rpc("fn_get_tenant_entitlements", { p_tenant_id: tenantId });
      if (error) throw error;
      return (data as unknown) as EntitlementsPayload;
    },
  });

  const ent = q.data?.entitlements ?? {};
  const tier = q.data?.tier ?? "patio";
  const effectiveTier = q.data?.effective_tier ?? tier;
  const subscriptionStatus = q.data?.subscription_status ?? "active";
  const graceEndsAt = q.data?.grace_ends_at ?? null;
  const trialExpiresAt = q.data?.trial_expires_at ?? null;
  const inGrace = subscriptionStatus === "grace";

  const limit = (key: string): number => {
    const v = ent[key];
    return typeof v === "number" ? v : Number(v ?? 0);
  };
  const has = (key: string): boolean => {
    const v = ent[key];
    return v === true || v === "true";
  };
  const value = <T extends EntitlementValue = EntitlementValue>(key: string): T | undefined =>
    ent[key] as T | undefined;
  const isUnlimited = (key: string) => limit(key) >= UNLIMITED_SENTINEL;
  const canAddMore = (key: string, current: number) => {
    const max = limit(key);
    if (max >= UNLIMITED_SENTINEL) return { allowed: true, remaining: Infinity, atCap: false };
    return { allowed: current < max, remaining: Math.max(0, max - current), atCap: current >= max };
  };

  return {
    tier,
    effectiveTier,
    subscriptionStatus,
    graceEndsAt,
    trialExpiresAt,
    inGrace,
    entitlements: ent,
    limit,
    has,
    value,
    isUnlimited,
    canAddMore,
    isLoading: q.isLoading,
    raw: q.data,
  };
}