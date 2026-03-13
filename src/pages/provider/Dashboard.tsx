import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, ClipboardList, Star, CalendarDays, Clock } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

interface KPIs {
  activeCustomers: number;
  activeContracts: number;
  visitsThisMonth: number;
  avgRating: number;
}

export default function Dashboard() {
  const [kpis, setKpis] = useState<KPIs>({ activeCustomers: 0, activeContracts: 0, visitsThisMonth: 0, avgRating: 0 });
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    const [custRes, contRes, visitsRes, feedbackRes] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      supabase.from("service_orders").select("id", { count: "exact", head: true })
        .gte("scheduled_date", format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd")),
      supabase.from("feedback").select("rating_stars"),
    ]);

    const avgRating = feedbackRes.data?.length
      ? feedbackRes.data.reduce((s, f) => s + f.rating_stars, 0) / feedbackRes.data.length
      : 0;

    setKpis({
      activeCustomers: custRes.count ?? 0,
      activeContracts: contRes.count ?? 0,
      visitsThisMonth: visitsRes.count ?? 0,
      avgRating: Math.round(avgRating * 10) / 10,
    });

    // Upcoming visits
    const { data: upcoming } = await supabase
      .from("service_orders")
      .select("id, scheduled_date, status, period_label, properties(name, customers(name))")
      .gte("scheduled_date", format(new Date(), "yyyy-MM-dd"))
      .order("scheduled_date")
      .limit(5);
    setUpcomingVisits(upcoming ?? []);

    // Pending reviews
    const { data: pending } = await supabase
      .from("service_orders")
      .select("id, scheduled_date, period_label, properties(name, customers(name))")
      .eq("status", "SENT_TO_CLIENT")
      .order("created_at", { ascending: false })
      .limit(5);
    setPendingReviews(pending ?? []);

    // Recent feedback
    const { data: fb } = await supabase
      .from("feedback")
      .select("id, rating_stars, comment, created_at, service_orders(id, properties(name))")
      .order("created_at", { ascending: false })
      .limit(5);
    setRecentFeedback(fb ?? []);
  };

  const kpiCards = [
    { label: "Active Customers", value: kpis.activeCustomers, icon: Users, color: "text-primary" },
    { label: "Active Contracts", value: kpis.activeContracts, icon: FileText, color: "text-info" },
    { label: "Visits This Month", value: kpis.visitsThisMonth, icon: ClipboardList, color: "text-warning" },
    { label: "Avg. Rating", value: kpis.avgRating > 0 ? `${kpis.avgRating} ★` : "—", icon: Star, color: "text-accent" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <k.icon className={`h-8 w-8 ${k.color}`} />
                <div>
                  <p className="text-2xl font-bold">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Upcoming visits */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Upcoming Visits</CardTitle></CardHeader>
          <CardContent>
            {upcomingVisits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming visits</p>
            ) : (
              <ul className="space-y-3">
                {upcomingVisits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{(v.properties as any)?.name}</p>
                      <p className="text-xs text-muted-foreground">{(v.properties as any)?.customers?.name}</p>
                    </div>
                    <Badge variant="secondary">{v.scheduled_date}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending reviews */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Pending Client Reviews</CardTitle></CardHeader>
          <CardContent>
            {pendingReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending reviews</p>
            ) : (
              <ul className="space-y-3">
                {pendingReviews.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{(v.properties as any)?.name}</p>
                      <p className="text-xs text-muted-foreground">{v.period_label}</p>
                    </div>
                    <Badge variant="outline" className="text-warning border-warning">Awaiting</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent feedback */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4" /> Recent Feedback</CardTitle></CardHeader>
          <CardContent>
            {recentFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback yet</p>
            ) : (
              <ul className="space-y-3">
                {recentFeedback.map((f) => (
                  <li key={f.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-accent font-medium">{"★".repeat(f.rating_stars)}</span>
                      <span className="text-muted-foreground text-xs">{(f.service_orders as any)?.properties?.name}</span>
                    </div>
                    {f.comment && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
