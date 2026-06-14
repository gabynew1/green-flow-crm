import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Plus, Clock, Mail, Unlink } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface ProviderCard {
  tenantId: string;
  name: string;
  uniqueTenantId: string | null;
  approvedAt: string | null;
  properties: {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    hasBlockingContract: boolean;
  }[];
}

interface PendingRequest {
  id: string;
  tenant_id: string;
  created_at: string;
  payload: any;
  tenant_name: string;
}

export default function ClientProviders() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<ProviderCard[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [delinkingId, setDelinkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: connections }, { data: pendingTasks }] = await Promise.all([
      supabase
        .from("client_connections")
        .select("id, tenant_id, status, responded_at, tenants(id, name, unique_tenant_id)")
        .eq("client_user_id", user.id)
        .eq("status", "APPROVED"),
      supabase
        .from("action_tasks")
        .select("id, tenant_id, created_at, payload, tenants(name)")
        .eq("task_type", "link_request")
        .eq("status", "pending")
        .or(`target_user_id.eq.${user.id},initiator_user_id.eq.${user.id}`),
    ]);

    const tenantIds = Array.from(
      new Set(((connections as any[]) ?? []).map((c) => c.tenant_id))
    );

    let propsByTenant: Record<string, ProviderCard["properties"]> = {};
    if (tenantIds.length > 0) {
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, address, city, tenant_id")
        .in("tenant_id", tenantIds);
      const propertyIds = (props ?? []).map((p: any) => p.id);
      let blockingByProp: Record<string, boolean> = {};
      if (propertyIds.length > 0) {
        const { data: ctrs } = await supabase
          .from("contracts")
          .select("property_id, status, archived")
          .in("property_id", propertyIds)
          .in("status", ["ACTIVE", "SENT_TO_CLIENT"]);
        (ctrs ?? []).forEach((c: any) => {
          if (!c.archived) blockingByProp[c.property_id] = true;
        });
      }
      (props ?? []).forEach((p: any) => {
        propsByTenant[p.tenant_id] = propsByTenant[p.tenant_id] ?? [];
        propsByTenant[p.tenant_id].push({
          id: p.id,
          name: p.name,
          address: p.address,
          city: p.city,
          hasBlockingContract: !!blockingByProp[p.id],
        });
      });
    }

    const dedup: Record<string, ProviderCard> = {};
    ((connections as any[]) ?? []).forEach((c) => {
      if (!c.tenants) return;
      if (dedup[c.tenant_id]) return;
      dedup[c.tenant_id] = {
        tenantId: c.tenant_id,
        name: c.tenants.name,
        uniqueTenantId: c.tenants.unique_tenant_id,
        approvedAt: c.responded_at,
        properties: propsByTenant[c.tenant_id] ?? [],
      };
    });

    setProviders(Object.values(dedup));
    setPending(
      ((pendingTasks as any[]) ?? []).map((t) => ({
        id: t.id,
        tenant_id: t.tenant_id,
        created_at: t.created_at,
        payload: t.payload,
        tenant_name: t.payload?.provider_name ?? t.tenants?.name ?? "Provider",
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelink = async (propertyId: string) => {
    setDelinkingId(propertyId);
    const { data, error } = await supabase.rpc("client_delink_property", {
      _property_id: propertyId,
    });
    setDelinkingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const canceled = (data as any)?.canceled_visits ?? 0;
    toast.success(
      canceled > 0
        ? `Property delinked. Canceled ${canceled} upcoming visit${canceled === 1 ? "" : "s"}.`
        : "Property delinked."
    );
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Providers
          </h1>
          <p className="text-sm text-muted-foreground">
            Service providers with access to your properties.
          </p>
        </div>
        <Link to="/client/connect">
          <Button>
            <Plus className="h-4 w-4 mr-1" /> Connect new provider
          </Button>
        </Link>
      </div>

      {pending.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" /> Pending requests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((p) => (
              <Link
                key={p.id}
                to={`/client/tasks?task=${p.id}`}
                className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/50"
              >
                <span className="font-medium">{p.tenant_name}</span>
                <span className="text-xs text-muted-foreground">
                  Sent {new Date(p.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : providers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You haven't connected any providers yet.
            </p>
            <Link to="/client/connect">
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-1" /> Connect a provider
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <Card key={p.tenantId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    {p.uniqueTenantId && (
                      <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                        {p.uniqueTenantId}
                      </Badge>
                    )}
                  </div>
                  <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Shared properties ({p.properties.length})
                  </p>
                  {p.properties.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No properties shared with this provider yet.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {p.properties.map((prop) => (
                        <li
                          key={prop.id}
                          className="flex items-start gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-xs"
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {prop.name}
                            </p>
                            <p className="truncate text-muted-foreground">
                              {[prop.address, prop.city].filter(Boolean).join(", ") ||
                                "No address"}
                            </p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="ml-auto h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                                disabled={prop.hasBlockingContract || delinkingId === prop.id}
                                title={
                                  prop.hasBlockingContract
                                    ? "Active or pending contract — close it first to delink"
                                    : "Delink from this provider"
                                }
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delink {prop.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {p.name} will lose access to this property. Any upcoming visits
                                  they have scheduled will be canceled. You can connect it to
                                  another provider afterwards.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelink(prop.id)}>
                                  Confirm delink
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}