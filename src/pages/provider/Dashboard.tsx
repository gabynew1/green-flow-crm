import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantQuery } from "@/lib/supabase-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, ClipboardList, Star, CalendarDays, Clock, AlertTriangle, ClipboardCheck, FileOutput, ArrowRight } from "lucide-react";
import { format, differenceInDays, subDays } from "date-fns";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface KPIs {
  activeCustomers: number;
  activeContracts: number;
  visitsDelivered: number;
  offersSent: number;
  avgRating: number;
  feedbackCount: number;
  draftInspections: number;
  staleInspections: number;
}

export default function Dashboard() {
  const tq = useTenantQuery();
  const [kpis, setKpis] = useState<KPIs>({ activeCustomers: 0, activeContracts: 0, visitsDelivered: 0, offersSent: 0, avgRating: 0, feedbackCount: 0, draftInspections: 0, staleInspections: 0 });
  const [pipelineCounts, setPipelineCounts] = useState({ inspections: 0, offers: 0, contracts: 0, visits: 0 });
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]);
  const [pendingReviews, setPendingReviews] = useState<any[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<any[]>([]);
  const [expiringContracts, setExpiringContracts] = useState<any[]>([]);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    const today = new Date();
    const threeDaysAgo = format(subDays(today, 3), "yyyy-MM-dd'T'HH:mm:ss");

    const ytdStart = format(new Date(today.getFullYear(), 0, 1), "yyyy-MM-dd");

    const [custRes, contRes, visitsDeliveredRes, offersSentRes, feedbackRes, inspRes, staleInspRes, offersRes, contractsRes, visitsCountRes] = await Promise.all([
      tq.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      supabase.from("service_orders").select("id", { count: "exact", head: true })
        .in("status", ["COMPLETED", "APPROVED", "SENT_TO_CLIENT"])
        .gte("performed_date", ytdStart),
      tq.from("offers").select("id", { count: "exact", head: true })
        .in("status", ["SENT_TO_CLIENT", "ACCEPTED", "REJECTED", "EXPIRED"])
        .gte("created_at", ytdStart),
      supabase.from("feedback").select("rating_stars").gte("created_at", ytdStart),
      tq.from("inspections").select("id", { count: "exact", head: true }).in("status", ["DRAFT", "SCHEDULED"]),
      tq.from("inspections").select("id", { count: "exact", head: true }).in("status", ["DRAFT", "SCHEDULED"]).lt("created_at", threeDaysAgo),
      tq.from("offers").select("id", { count: "exact", head: true }).in("status", ["DRAFT", "IN_PROGRESS", "SENT_TO_CLIENT"]),
      supabase.from("contracts").select("id", { count: "exact", head: true }).in("status", ["DRAFT", "SENT_TO_CLIENT", "SIGNED"]),
      supabase.from("service_orders").select("id", { count: "exact", head: true }).in("status", ["SCHEDULED", "IN_PROGRESS", "PENDING_APPROVAL"]),
    ]);

    const avgRating = feedbackRes.data?.length
      ? feedbackRes.data.reduce((s, f) => s + f.rating_stars, 0) / feedbackRes.data.length
      : 0;

    setKpis({
      activeCustomers: custRes.count ?? 0,
      activeContracts: contRes.count ?? 0,
      visitsDelivered: visitsDeliveredRes.count ?? 0,
      offersSent: offersSentRes.count ?? 0,
      avgRating: Math.round(avgRating * 10) / 10,
      feedbackCount: feedbackRes.data?.length ?? 0,
      draftInspections: inspRes.count ?? 0,
      staleInspections: staleInspRes.count ?? 0,
    });

    setPipelineCounts({
      inspections: inspRes.count ?? 0,
      offers: offersRes.count ?? 0,
      contracts: contractsRes.count ?? 0,
      visits: visitsCountRes.count ?? 0,
    });

    const todayStr = format(today, "yyyy-MM-dd");
    const thirtyDaysOut = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");

    const [upcomingRes, pendingRevRes, fbRes, expiringRes] = await Promise.all([
      supabase.from("service_orders")
        .select("id, scheduled_date, status, period_label, properties(name, customers(name))")
        .gte("scheduled_date", todayStr).order("scheduled_date").limit(5),
      supabase.from("service_orders")
        .select("id, scheduled_date, period_label, properties(name, customers(name))")
        .eq("status", "SENT_TO_CLIENT").order("created_at", { ascending: false }).limit(5),
      supabase.from("feedback")
        .select("id, rating_stars, comment, created_at, service_orders(id, properties(name))")
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("contracts")
        .select("id, contract_name, end_date, properties(name, customers(name))")
        .eq("status", "ACTIVE").not("end_date", "is", null)
        .lte("end_date", thirtyDaysOut).gte("end_date", todayStr)
        .order("end_date").limit(5),
    ]);

    setUpcomingVisits(upcomingRes.data ?? []);
    setPendingReviews(pendingRevRes.data ?? []);
    setRecentFeedback(fbRes.data ?? []);
    setExpiringContracts(expiringRes.data ?? []);
  };

  const kpiCards = [
    { label: "Active Customers", value: kpis.activeCustomers, icon: Users, color: "text-primary" },
    { label: "Active Contracts", value: kpis.activeContracts, icon: FileText, color: "text-info" },
    { label: "Visits Delivered (YTD)", value: kpis.visitsDelivered, icon: ClipboardList, color: "text-primary" },
    { label: "Offers Sent (YTD)", value: kpis.offersSent, icon: FileOutput, color: "text-warning" },
    { label: `Feedback (${kpis.feedbackCount})`, value: kpis.avgRating > 0 ? `${kpis.avgRating} ★` : "—", icon: Star, color: "text-accent" },
  ];

  const pipelineSteps = [
    { label: "Inspections", count: pipelineCounts.inspections, url: "/provider/inspections", icon: ClipboardCheck },
    { label: "Offers", count: pipelineCounts.offers, url: "/provider/offers", icon: FileOutput },
    { label: "Contracts", count: pipelineCounts.contracts, url: "/provider/contracts", icon: FileText },
    { label: "Visits", count: pipelineCounts.visits, url: "/provider/visits", icon: ClipboardList },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Pipeline Summary — To-Do Work */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-3">Pipeline — Open Work</p>
        <div className="grid grid-cols-4 gap-4">
          {pipelineSteps.map((step) => (
            <Link key={step.label} to={step.url} className="group">
              <div className="aspect-square rounded-xl bg-muted hover:bg-muted/80 transition-colors flex flex-col items-center justify-center gap-3 p-4">
                <step.icon className="h-8 w-8 text-primary" />
                <p className="text-3xl font-bold leading-none">{step.count}</p>
                <p className="text-xs text-muted-foreground font-medium">{step.label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
        {/* SLA Alerts */}
        {kpis.staleInspections > 0 && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader><CardTitle className="text-base flex items-center gap-2 text-destructive"><AlertTriangle className="h-4 w-4" /> SLA Alerts: Stale Inspections</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm">
                You have <span className="font-bold">{kpis.staleInspections}</span> inspections that have been pending for more than 3 days.
                Follow up to maintain high engagement.
              </p>
              <Link to="/provider/pipeline">
                <Button size="sm" variant="link" className="px-0 text-destructive pt-2">View Pipeline <ArrowRight className="h-3 w-3 ml-1" /></Button>
              </Link>
            </CardContent>
          </Card>
        )}

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
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Pending Client Reviews</CardTitle></CardHeader>
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

        {/* Expiring contracts */}
        {expiringContracts.length > 0 && (
          <Card className="border-warning/30">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Expiring Soon</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {expiringContracts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/provider/contracts/${c.id}`} className="flex items-center justify-between text-sm hover:text-primary transition-colors">
                      <div>
                        <p className="font-medium">{c.contract_name}</p>
                        <p className="text-xs text-muted-foreground">{(c.properties as any)?.customers?.name}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {differenceInDays(new Date(c.end_date), new Date())}d left
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

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
