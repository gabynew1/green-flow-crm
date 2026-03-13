import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search } from "lucide-react";
import { format } from "date-fns";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT_TO_CLIENT: "outline",
  SIGNED: "default",
  ACTIVE: "default",
  CLOSED: "destructive",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_CLIENT: "Sent to Client",
  SIGNED: "Signed",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const billingLabels: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ONE_TIME: "Ad hoc",
};

type FilterTab = "all" | "active" | "closed";

export default function ClientContracts() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contracts")
      .select("*, properties(name)")
      .order("created_at", { ascending: false });
    setContracts(data ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = contracts;
    if (filterTab === "active") list = list.filter(c => ["ACTIVE", "SIGNED", "SENT_TO_CLIENT"].includes(c.status));
    else if (filterTab === "closed") list = list.filter(c => c.status === "CLOSED");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.contract_name?.toLowerCase().includes(q) ||
        (c.properties as any)?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [contracts, filterTab, search]);

  const counts = useMemo(() => ({
    all: contracts.length,
    active: contracts.filter(c => ["ACTIVE", "SIGNED", "SENT_TO_CLIENT"].includes(c.status)).length,
    closed: contracts.filter(c => c.status === "CLOSED").length,
  }), [contracts]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "active", label: `Active (${counts.active})` },
    { key: "closed", label: `Closed (${counts.closed})` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Contracts</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {tabs.map(t => (
            <Button key={t.key} variant={filterTab === t.key ? "default" : "outline"} size="sm" onClick={() => setFilterTab(t.key)} className="text-xs">
              {t.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contracts…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{contracts.length === 0 ? "No contracts yet" : "No contracts match your filters"}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <Link key={c.id} to={`/client/contracts/${c.id}`} className="block">
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium">{c.contract_name}</p>
                        <p className="text-sm text-muted-foreground">{(c.properties as any)?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(c.start_date), "MMM d, yyyy")} → {c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "Ongoing"}
                        </p>
                        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                          {c.visit_frequency_count && c.visit_frequency_type && (
                            <span>Visits: {c.visit_frequency_count}x / {c.visit_frequency_type.toLowerCase()}</span>
                          )}
                          <span>Billing: {billingLabels[c.billing_cycle] || c.billing_cycle}</span>
                        </div>
                      </div>
                    </div>
                    <Badge variant={statusColors[c.status] || "secondary"} className="text-[10px]">
                      {statusLabels[c.status] || c.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
