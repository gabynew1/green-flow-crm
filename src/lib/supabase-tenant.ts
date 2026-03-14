import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Database } from "@/integrations/supabase/types";

export function useTenantQuery() {
    const { tenantId } = useAuth();

    /**
     * Returns a Supabase query builder that automatically filters by tenant_id
     * if the table has one.
     */
    const from = <T extends keyof Database["public"]["Tables"]>(table: T) => {
        const query = supabase.from(table);

        // List of tables known to have tenant_id from types.ts
        const tablesWithTenant: string[] = [
            "customers",
            "inspections",
            "offers",
            "profiles",
            "service_catalog",
            "provider_invites",
            "client_connections"
        ];

        if (tenantId && tablesWithTenant.includes(table as string)) {
            return (query.select() as any).eq("tenant_id", tenantId);
        }

        return query;
    };

    return { from };
}
