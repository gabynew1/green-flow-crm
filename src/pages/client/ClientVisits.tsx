import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-info/10 text-info",
  COMPLETED: "bg-primary/10 text-primary",
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-success/10 text-success",
  SENT_TO_CLIENT: "bg-accent/10 text-accent",
  CANCELED: "bg-destructive/10 text-destructive",
};

export default function ClientVisits() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("service_orders")
      .select("*, properties(name)")
      .order("scheduled_date", { ascending: false })
      .then(({ data }) => setOrders(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Service Visits</h1>
      <div className="space-y-3">
        {orders.map(o => (
          <Link key={o.id} to={`/client/visits/${o.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{(o.properties as any)?.name}</p>
                  <p className="text-xs text-muted-foreground">{o.period_label || o.scheduled_date}</p>
                </div>
                <Badge className={statusColor[o.status]} variant="secondary">{o.status.replace(/_/g, " ")}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {orders.length === 0 && <p className="text-muted-foreground text-center py-8">No service visits yet</p>}
      </div>
    </div>
  );
}
