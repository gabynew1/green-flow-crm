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
  SENT_TO_CLIENT: "outline",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "destructive",
};

const statusLabels: Record<string, string> = {
  SENT_TO_CLIENT: "Pending Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELED: "Canceled",
};

type FilterTab = "all" | "pending" | "decided";

export default function ClientOffers() {
  const { user } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("offers")
      .select("*, properties(name)")
      .order("created_at", { ascending: false });
    setOffers(data ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = offers;
    if (filterTab === "pending") list = list.filter(o => o.status === "SENT_TO_CLIENT");
    else if (filterTab === "decided") list = list.filter(o => ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELED"].includes(o.status));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => o.offer_name?.toLowerCase().includes(q) || (o.properties as any)?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [offers, filterTab, search]);

  const counts = useMemo(() => ({
    all: offers.length,
    pending: offers.filter(o => o.status === "SENT_TO_CLIENT").length,
    decided: offers.filter(o => ["ACCEPTED", "REJECTED", "EXPIRED", "CANCELED"].includes(o.status)).length,
  }), [offers]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "decided", label: `Decided (${counts.decided})` },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Offers</h1>

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
          <Input placeholder="Search offers…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{offers.length === 0 ? "No offers yet" : "No offers match your filters"}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(o => (
            <Link key={o.id} to={`/client/offers/${o.id}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="pt-4 pb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium">{o.offer_name}</p>
                      <p className="text-sm text-muted-foreground">{(o.properties as any)?.name}</p>
                      {o.valid_until && <p className="text-xs text-muted-foreground mt-1">Valid until {format(new Date(o.valid_until), "MMM d, yyyy")}</p>}
                      {o.total_value && <p className="text-xs font-medium mt-0.5">${Number(o.total_value).toFixed(2)}</p>}
                    </div>
                  </div>
                  <Badge variant={statusColors[o.status] || "secondary"}>{statusLabels[o.status] || o.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
