import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "react-router-dom";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  CANCELED: "bg-destructive/10 text-destructive",
};

export function PropertyVisitsTab({ propertyId }: { propertyId: string }) {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("service_orders").select("*").eq("property_id", propertyId)
      .order("scheduled_date", { ascending: true })
      .then(({ data }) => setOrders(data ?? []));
  }, [propertyId]);

  if (orders.length === 0) return <p className="text-muted-foreground text-center py-8">No service visits yet</p>;

  return (
    <div className="space-y-3">
      {orders.map(o => (
        <Link key={o.id} to={`/provider/visits/${o.id}`}>
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="pt-4 pb-4 flex items-center justify-between">
              <div>
                <p className="font-medium">{o.period_label || o.scheduled_date || "Unscheduled"}</p>
                <p className="text-xs text-muted-foreground">{o.period_type} · {o.scheduled_date}</p>
              </div>
              <Badge className={statusColor[o.status]} variant="secondary">{o.status.replace(/_/g, " ")}</Badge>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
