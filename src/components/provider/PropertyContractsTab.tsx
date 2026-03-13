import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-success/10 text-success",
  PAUSED: "bg-warning/10 text-warning",
  TERMINATED: "bg-destructive/10 text-destructive",
};

export function PropertyContractsTab({ propertyId }: { propertyId: string }) {
  const [contracts, setContracts] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("contracts").select("*").eq("property_id", propertyId).order("start_date", { ascending: false })
      .then(({ data }) => setContracts(data ?? []));
  }, [propertyId]);

  if (contracts.length === 0) return <p className="text-muted-foreground text-center py-8">No contracts for this property</p>;

  return (
    <div className="space-y-3">
      {contracts.map(c => (
        <Link key={c.id} to={`/provider/contracts/${c.id}`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="pt-4 pb-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{c.contract_name}</p>
                <p className="text-xs text-muted-foreground">{c.start_date} → {c.end_date || "Ongoing"} · {c.billing_cycle}</p>
              </div>
              <Badge className={statusColor[c.status]} variant="secondary">{c.status}</Badge>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
