import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

// Tables known to have tenant_id
const TENANT_TABLES = new Set([
    "customers",
    "inspections",
    "offers",
    "profiles",
    "service_catalog",
    "provider_invites",
    "client_connections"
]);

export function useTenantQuery() {
    const { tenantId } = useAuth();

    /**
     * Returns a Supabase query builder for the given table.
     * For tables with tenant_id, automatically applies the filter
     * AFTER you call .select() yourself.
     *
     * Usage: tq.from("customers").select("id, name").limit(10)
     * The tenant filter is applied via .select() override.
     */
    const from = <T extends keyof Database["public"]["Tables"]>(table: T) => {
        const base = supabase.from(table);

        if (tenantId && TENANT_TABLES.has(table as string)) {
            // Return a proxy that intercepts .select() and appends .eq("tenant_id", ...)
            return new Proxy(base, {
                get(target, prop, receiver) {
                    if (prop === "select") {
                        return (...args: any[]) => {
                            const result = (target as any).select(...args);
                            return result.eq("tenant_id", tenantId);
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                },
            }) as typeof base;
        }

        return base;
    };

    return { from };
}