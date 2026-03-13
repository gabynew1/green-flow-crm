import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SENT_TO_CLIENT: "bg-warning/10 text-warning",
  CLIENT_APPROVED: "bg-success/10 text-success",
  CLIENT_REJECTED: "bg-destructive/10 text-destructive",
};

export default function ServiceVisits() {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase
      .from("service_orders")
      .select("*, properties(name, customers(name))")
      .order("scheduled_date", { ascending: false });
    setOrders(data ?? []);
  };

  const filtered = orders.filter(o => {
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return (o.properties as any)?.name?.toLowerCase().includes(q) ||
      (o.properties as any)?.customers?.name?.toLowerCase().includes(q) ||
      o.period_label?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Service Visits</h1>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT_TO_CLIENT">Sent to Client</SelectItem>
            <SelectItem value="CLIENT_APPROVED">Approved</SelectItem>
            <SelectItem value="CLIENT_REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map(o => (
          <Link key={o.id} to={`/provider/visits/${o.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{(o.properties as any)?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(o.properties as any)?.customers?.name} · {o.period_label || o.scheduled_date} · {o.period_type}
                  </p>
                </div>
                <Badge className={statusColor[o.status]} variant="secondary">{o.status.replace(/_/g, " ")}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">No service visits found</p>}
      </div>
    </div>
  );
}
