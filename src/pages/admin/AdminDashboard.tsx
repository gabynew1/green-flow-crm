import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Building2,
    Users,
    AlertTriangle,
    ShieldCheck,
    Globe,
    ScrollText,
    Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

const KpiCard = ({
    title,
    value,
    icon: Icon,
    description,
    accent,
}: {
    title: string;
    value: React.ReactNode;
    icon: any;
    description?: string;
    accent?: "default" | "warning" | "success";
}) => (
    <Card className="overflow-hidden transition-all hover:shadow-md border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-primary/5">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {title}
            </CardTitle>
            <div className="p-2 bg-background rounded-lg shadow-sm">
                <Icon
                    className={
                        accent === "warning"
                            ? "h-4 w-4 text-destructive"
                            : accent === "success"
                              ? "h-4 w-4 text-green-600"
                              : "h-4 w-4 text-primary"
                    }
                />
            </div>
        </CardHeader>
        <CardContent className="pt-4">
            <div className="text-3xl font-bold tracking-tight">{value}</div>
            {description && (
                <p className="text-xs text-muted-foreground mt-1 font-medium">{description}</p>
            )}
        </CardContent>
    </Card>
);

export default function AdminDashboard() {
    const { data: stats, isLoading } = useQuery({
        queryKey: ["admin-stats"],
        queryFn: async () => {
            const [
                tenantsAll,
                tenantsActive,
                tenantsTrial,
                tenantsPro,
                tenantsEnt,
                profiles,
                openAlerts,
            ] = await Promise.all([
                supabase.from("tenants").select("id", { count: "exact", head: true }),
                supabase.from("tenants").select("id", { count: "exact", head: true }).eq("status", "active"),
                supabase.from("tenants").select("id", { count: "exact", head: true }).eq("subscription_tier", "trial"),
                supabase.from("tenants").select("id", { count: "exact", head: true }).eq("subscription_tier", "professional"),
                supabase.from("tenants").select("id", { count: "exact", head: true }).eq("subscription_tier", "enterprise"),
                supabase.from("profiles").select("id", { count: "exact", head: true }),
                supabase.from("security_alerts").select("id", { count: "exact", head: true }).eq("resolved", false),
            ]);

            return {
                tenantsAll: tenantsAll.count ?? 0,
                tenantsActive: tenantsActive.count ?? 0,
                tenantsTrial: tenantsTrial.count ?? 0,
                tenantsPro: tenantsPro.count ?? 0,
                tenantsEnt: tenantsEnt.count ?? 0,
                users: profiles.count ?? 0,
                openAlerts: openAlerts.count ?? 0,
            };
        },
    });

    const { data: recentActivity, isLoading: activityLoading } = useQuery({
        queryKey: ["admin-recent-activity"],
        queryFn: async () => {
            const { data } = await supabase
                .from("super_admin_audit_logs")
                .select("id, action, target_type, target_id, created_at, metadata")
                .order("created_at", { ascending: false })
                .limit(5);
            return data ?? [];
        },
    });

    const { data: recentTenants, isLoading: tenantsLoading } = useQuery({
        queryKey: ["admin-recent-tenants"],
        queryFn: async () => {
            const { data } = await supabase
                .from("tenants")
                .select("id, name, subscription_tier, status, created_at")
                .order("created_at", { ascending: false })
                .limit(5);
            return data ?? [];
        },
    });

    if (isLoading) {
        return (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
            </div>
        );
    }

    const breakdown = [
        { label: "Trial", value: stats?.tenantsTrial ?? 0 },
        { label: "Professional", value: stats?.tenantsPro ?? 0 },
        { label: "Enterprise", value: stats?.tenantsEnt ?? 0 },
    ];

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    System Overview
                </h2>
                <p className="text-muted-foreground mt-1 font-medium">
                    Live metrics across {stats?.tenantsActive ?? 0} active tenant{stats?.tenantsActive === 1 ? "" : "s"}.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="Active Tenants"
                    value={stats?.tenantsActive ?? 0}
                    icon={Building2}
                    description={`${stats?.tenantsAll ?? 0} total registered`}
                />
                <KpiCard
                    title="Total Users"
                    value={stats?.users ?? 0}
                    icon={Users}
                    description="Across all tenants"
                />
                <KpiCard
                    title="Trial Tenants"
                    value={stats?.tenantsTrial ?? 0}
                    icon={Activity}
                    description="Currently on trial plan"
                />
                <KpiCard
                    title="Open Security Alerts"
                    value={stats?.openAlerts ?? 0}
                    icon={AlertTriangle}
                    description={stats?.openAlerts ? "Requires attention" : "All clear"}
                    accent={stats?.openAlerts ? "warning" : "success"}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                <Card className="lg:col-span-4 border-primary/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ScrollText className="h-5 w-5 text-primary" />
                            Recent Admin Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {activityLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <Skeleton key={i} className="h-14 rounded-lg" />
                                ))}
                            </div>
                        ) : recentActivity && recentActivity.length > 0 ? (
                            <div className="space-y-3">
                                {recentActivity.map((log) => (
                                    <div
                                        key={log.id}
                                        className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                                    >
                                        <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                                            <Activity className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <p className="text-sm font-semibold">{log.action}</p>
                                            <p className="text-xs text-muted-foreground font-medium truncate">
                                                {log.target_type
                                                    ? `${log.target_type}${log.target_id ? ` · ${log.target_id.slice(0, 8)}` : ""}`
                                                    : "System action"}
                                            </p>
                                        </div>
                                        <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 whitespace-nowrap">
                                            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-10 text-center text-sm text-muted-foreground">
                                No admin activity recorded yet.
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3 border-primary/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className={stats?.openAlerts ? "h-5 w-5 text-destructive" : "h-5 w-5 text-green-600"} />
                            Security Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {stats?.openAlerts ? (
                                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-lg bg-destructive flex items-center justify-center shadow-lg shadow-destructive/20">
                                        <AlertTriangle className="h-6 w-6 text-destructive-foreground" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-destructive">
                                            {stats.openAlerts} open alert{stats.openAlerts === 1 ? "" : "s"}
                                        </p>
                                        <p className="text-xs text-destructive/70 font-semibold uppercase tracking-widest">
                                            Review required
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-lg bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                                        <ShieldCheck className="h-6 w-6 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-green-700">All clear</p>
                                        <p className="text-xs text-green-600/70 font-semibold uppercase tracking-widest">
                                            No open alerts
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    Subscription Mix
                                </p>
                                {breakdown.map((b) => (
                                    <div key={b.label} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">{b.label}</span>
                                        <span className="font-semibold">{b.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-primary" />
                        Recently Created Tenants
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {tenantsLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-12 rounded-lg" />
                            ))}
                        </div>
                    ) : recentTenants && recentTenants.length > 0 ? (
                        <div className="divide-y">
                            {recentTenants.map((t) => (
                                <div key={t.id} className="flex items-center justify-between py-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate">{t.name}</p>
                                        <p className="text-xs text-muted-foreground capitalize">
                                            {t.subscription_tier} · {t.status}
                                        </p>
                                    </div>
                                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                            No tenants yet.
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
