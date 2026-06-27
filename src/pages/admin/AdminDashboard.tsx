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
    TrendingUp,
    Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { TIERS, TIER_ORDER, type TierId } from "@/lib/tiers";

// Monthly price in EUR (excl. VAT) per tier — single source of truth for revenue math.
const TIER_PRICE_EUR: Record<TierId, number> = {
  patio: 0,
  backyard: 5,
  estate: 30,
  territory: 100,
  territory_trial: 0, // trials don't generate revenue
};

const formatEur = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

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
            const [tenantsRows, profiles, openAlerts] = await Promise.all([
                supabase.from("tenants").select("id, status, subscription_tier, trial_expires_at"),
                supabase.from("profiles").select("id", { count: "exact", head: true }),
                supabase.from("security_alerts").select("id", { count: "exact", head: true }).eq("resolved", false),
            ]);

            const rows = tenantsRows.data ?? [];
            const activeRows = rows.filter((r) => r.status === "active");

            // Tier counts (active tenants only — paused/cancelled don't bill)
            const tierCounts: Record<TierId, number> = {
                patio: 0, backyard: 0, estate: 0, territory: 0, territory_trial: 0,
            };
            let mrrEur = 0;
            for (const r of activeRows) {
                const tier = (r.subscription_tier as TierId) ?? "patio";
                if (tier in tierCounts) tierCounts[tier] += 1;
                mrrEur += TIER_PRICE_EUR[tier] ?? 0;
            }

            // Trials expiring in next 30 days = at-risk / upcoming conversion opportunity
            const now = Date.now();
            const in30 = now + 30 * 24 * 60 * 60 * 1000;
            const trialsExpiringSoon = activeRows.filter((r) => {
                if (r.subscription_tier !== "territory_trial" || !r.trial_expires_at) return false;
                const t = new Date(r.trial_expires_at).getTime();
                return t >= now && t <= in30;
            }).length;

            return {
                tenantsAll: rows.length,
                tenantsActive: activeRows.length,
                tierCounts,
                users: profiles.count ?? 0,
                openAlerts: openAlerts.count ?? 0,
                mrrEur,
                arrEur: mrrEur * 12,
                trialsExpiringSoon,
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

    const tierCounts = stats?.tierCounts;
    const breakdown = TIER_ORDER.map((id) => ({
        id,
        label: TIERS[id].name,
        priceLabel: TIERS[id].priceLabel,
        value: tierCounts?.[id] ?? 0,
        monthly: (tierCounts?.[id] ?? 0) * TIER_PRICE_EUR[id],
    }));
    const trialCount = tierCounts?.territory_trial ?? 0;

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
                    title="Projected MRR"
                    value={formatEur(stats?.mrrEur ?? 0)}
                    icon={Wallet}
                    description={`${formatEur(stats?.arrEur ?? 0)} ARR · excl. VAT`}
                    accent="success"
                />
                <KpiCard
                    title="Active Trials"
                    value={trialCount}
                    icon={Activity}
                    description={`${stats?.trialsExpiringSoon ?? 0} expiring in 30 days`}
                />
                <KpiCard
                    title="Open Security Alerts"
                    value={stats?.openAlerts ?? 0}
                    icon={AlertTriangle}
                    description={stats?.openAlerts ? "Requires attention" : "All clear"}
                    accent={stats?.openAlerts ? "warning" : "success"}
                />
            </div>

            <Card className="border-primary/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Projected Revenue by Tier
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        {breakdown.map((b) => (
                            <div
                                key={b.id}
                                className="rounded-xl border border-primary/10 p-4 bg-background hover:bg-muted/30 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        {b.label}
                                    </p>
                                    <span className="text-[10px] font-semibold text-muted-foreground">
                                        {b.priceLabel}
                                    </span>
                                </div>
                                <p className="text-2xl font-bold mt-2">{b.value}</p>
                                <p className="text-xs text-muted-foreground font-medium mt-1">
                                    {formatEur(b.monthly)} / mo
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-sm">
                        <span className="text-muted-foreground">
                            Total paying tenants:{" "}
                            <span className="font-semibold text-foreground">
                                {breakdown.reduce((acc, b) => acc + (b.id === "patio" ? 0 : b.value), 0)}
                            </span>
                            {" · "}Trials (non-revenue):{" "}
                            <span className="font-semibold text-foreground">{trialCount}</span>
                        </span>
                        <span className="text-muted-foreground">
                            MRR <span className="font-bold text-foreground">{formatEur(stats?.mrrEur ?? 0)}</span>
                            {" · "}ARR <span className="font-bold text-foreground">{formatEur(stats?.arrEur ?? 0)}</span>
                            <span className="ml-1 text-xs">(excl. VAT)</span>
                        </span>
                    </div>
                </CardContent>
            </Card>

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
                                            <p className="text-sm font-semibold">
                                                {log.action === "new_account_signup"
                                                    ? `New signup: ${(log.metadata as any)?.full_name || (log.metadata as any)?.email || "unknown"}`
                                                    : log.action}
                                            </p>
                                            <p className="text-xs text-muted-foreground font-medium truncate">
                                                {log.action === "new_account_signup"
                                                    ? `${(log.metadata as any)?.label || "Account"} · ${(log.metadata as any)?.role || ""}${(log.metadata as any)?.tenant_name ? ` · ${(log.metadata as any).tenant_name}` : ""}`
                                                    : log.target_type
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
                                    <div key={b.id} className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">{b.label}</span>
                                        <span className="font-semibold">{b.value}</span>
                                    </div>
                                ))}
                                {trialCount > 0 && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">Territory Trial</span>
                                        <span className="font-semibold">{trialCount}</span>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-sm pt-2 border-t mt-2">
                                    <span className="text-muted-foreground">Total users</span>
                                    <span className="font-semibold">{stats?.users ?? 0}</span>
                                </div>
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
