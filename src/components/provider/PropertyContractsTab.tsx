import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-success/10 text-success",
  PAUSED: "bg-warning/10 text-warning",
  TERMINATED: "bg-destructive/10 text-destructive",
};

const freqLabel: Record<string, string> = {
  PER_VISIT: "per visit",
  PER_WEEK: "per week",
  PER_MONTH: "per month",
  ONE_TIME: "one-time",
};

export function PropertyContractsTab({ propertyId }: { propertyId: string }) {
  const [contracts, setContracts] = useState<any[]>([]);
  const [lineItemsByContract, setLineItemsByContract] = useState<Record<string, any[]>>({});

  useEffect(() => {
    supabase.from("contracts").select("*").eq("property_id", propertyId).order("start_date", { ascending: false })
      .then(async ({ data }) => {
        const cs = data ?? [];
        setContracts(cs);
        if (cs.length > 0) {
          const { data: items } = await supabase
            .from("contract_line_items")
            .select("*, service_catalog(name)")
            .in("contract_id", cs.map(c => c.id))
            .order("created_at");
          const grouped: Record<string, any[]> = {};
          for (const item of items ?? []) {
            if (!grouped[item.contract_id]) grouped[item.contract_id] = [];
            grouped[item.contract_id].push(item);
          }
          setLineItemsByContract(grouped);
        }
      });
  }, [propertyId]);

  if (contracts.length === 0) return <p className="text-muted-foreground text-center py-8">No contracts for this property</p>;

  return (
    <div className="space-y-3">
      {contracts.map(c => {
        const items = lineItemsByContract[c.id] || [];
        const total = items.reduce((sum, li) => sum + (li.unit_price != null ? Number(li.unit_price) * Number(li.quantity) : 0), 0);
        return (
          <Link key={c.id} to={`/provider/contracts/${c.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{c.contract_name}</p>
                    <p className="text-xs text-muted-foreground">{c.start_date} → {c.end_date || "Ongoing"} · {c.billing_cycle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {total > 0 && <span className="text-xs font-medium">${total.toFixed(2)}</span>}
                    <Badge className={statusColor[c.status]} variant="secondary">{c.status}</Badge>
                  </div>
                </div>
                {items.length > 0 && (
                  <div className="pl-2 border-l-2 border-muted space-y-0.5">
                    {items.map(li => (
                      <p key={li.id} className="text-xs text-muted-foreground">
                        {li.custom_name || (li.service_catalog as any)?.name} — {li.quantity} × {freqLabel[li.frequency_type] || li.frequency_type}
                        {li.unit_price != null && ` · ${formatCurrency(Number(li.unit_price), currency)}/unit`}
                        {li.max_occurrences_per_period != null && ` · max ${li.max_occurrences_per_period}`}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
