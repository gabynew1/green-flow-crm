import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, ArrowRight, Home } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Card = {
  connectionId: string;
  customerId: string;
  customerName: string;
  email?: string | null;
  properties: { id: string; name: string; address?: string | null }[];
  approvedAt: string;
};

export default function NewConnectionsBoard() {
  const { tenantId } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      // 1. Approved connections for this tenant
      const { data: conns } = await supabase
        .from("client_connections")
        .select("id, client_user_id, responded_at, requested_at, status")
        .eq("tenant_id", tenantId)
        .eq("status", "APPROVED")
        .order("responded_at", { ascending: false });

      if (!conns || conns.length === 0) {
        if (!cancelled) { setCards([]); setLoading(false); }
        return;
      }

      const userIds = conns.map((c) => c.client_user_id);

      // 2. Profiles -> customer_id
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, customer_id, full_name, company_name, email, contact_email")
        .in("user_id", userIds);
      const profileByUser = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

      const customerIds = (profiles ?? []).map((p: any) => p.customer_id).filter(Boolean) as string[];
      if (customerIds.length === 0) {
        if (!cancelled) { setCards([]); setLoading(false); }
        return;
      }

      // 3. Properties for these customers (scoped to tenant)
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, address, customer_id")
        .in("customer_id", customerIds)
        .eq("tenant_id", tenantId);
      const propsByCustomer = new Map<string, any[]>();
      (props ?? []).forEach((p: any) => {
        const arr = propsByCustomer.get(p.customer_id) ?? [];
        arr.push(p);
        propsByCustomer.set(p.customer_id, arr);
      });

      // 4. Existing pipeline activity (any inspection / offer / contract)
      const propIds = (props ?? []).map((p: any) => p.id);
      const [insp, offers, contracts] = await Promise.all([
        propIds.length
          ? supabase.from("inspections").select("property_id").in("property_id", propIds).eq("tenant_id", tenantId)
          : Promise.resolve({ data: [] as any[] }),
        customerIds.length
          ? supabase.from("offers").select("customer_id").in("customer_id", customerIds).eq("tenant_id", tenantId)
          : Promise.resolve({ data: [] as any[] }),
        propIds.length
          ? supabase.from("contracts").select("property_id").in("property_id", propIds).eq("tenant_id", tenantId)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const customersWithActivity = new Set<string>();
      (offers.data ?? []).forEach((o: any) => customersWithActivity.add(o.customer_id));
      const propsWithActivity = new Set<string>();
      (insp.data ?? []).forEach((i: any) => propsWithActivity.add(i.property_id));
      (contracts.data ?? []).forEach((c: any) => propsWithActivity.add(c.property_id));

      const out: Card[] = [];
      for (const c of conns) {
        const prof: any = profileByUser.get(c.client_user_id);
        if (!prof?.customer_id) continue;
        if (customersWithActivity.has(prof.customer_id)) continue;
        const customerProps = propsByCustomer.get(prof.customer_id) ?? [];
        // Skip if every property already has activity
        const remaining = customerProps.filter((p: any) => !propsWithActivity.has(p.id));
        if (customerProps.length > 0 && remaining.length === 0) continue;

        out.push({
          connectionId: c.id,
          customerId: prof.customer_id,
          customerName: prof.full_name || prof.company_name || prof.email || "Client",
          email: prof.contact_email || prof.email,
          properties: (remaining.length ? remaining : customerProps).map((p: any) => ({
            id: p.id, name: p.name, address: p.address,
          })),
          approvedAt: c.responded_at || c.requested_at,
        });
      }

      if (!cancelled) { setCards(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  if (loading || cards.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">New connections — ready to contract</h2>
        <Badge variant="secondary" className="ml-1">{cards.length}</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.connectionId} className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <div>
                <Link
                  to={`/provider/customers/${c.customerId}`}
                  className="font-semibold text-sm hover:underline"
                >
                  {c.customerName}
                </Link>
                {c.email && (
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                )}
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Linked {formatDistanceToNow(new Date(c.approvedAt), { addSuffix: true })}
                </p>
              </div>
              {c.properties.length > 0 && (
                <ul className="space-y-1 rounded-md border border-border/50 bg-background/60 p-2">
                  {c.properties.slice(0, 3).map((p) => (
                    <li key={p.id} className="flex items-start gap-1.5 text-xs">
                      <Home className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="font-medium">{p.name}</span>
                        {p.address && <span className="block text-muted-foreground">{p.address}</span>}
                      </span>
                    </li>
                  ))}
                  {c.properties.length > 3 && (
                    <li className="text-[10px] text-muted-foreground">
                      +{c.properties.length - 3} more
                    </li>
                  )}
                </ul>
              )}
              <Button asChild size="sm" className="w-full">
                <Link to={`/provider/customers/${c.customerId}`}>
                  Start contracting <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
