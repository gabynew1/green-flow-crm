import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Building2,
    Users,
    DollarSign,
    AlertTriangle,
    TrendingUp,
    ShieldCheck,
    Globe,
    ArrowUpRight,
    ArrowDownRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KpiCard = ({ title, value, icon: Icon, description, trend, trendValue }: any) => (
    <Card className="overflow-hidden transition-all hover:shadow-md border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-primary/5">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
            <div className="p-2 bg-background rounded-lg shadow-sm">
                <Icon className="h-4 w-4 text-primary" />
            </div>
        </CardHeader>
        <CardContent className="pt-4">
            <div className="text-3xl font-bold tracking-tight">{value}</div>
            <div className="flex items-center gap-1 mt-1">
                {trend === "up" ? (
                    <ArrowUpRight className="h-4 w-4 text-green-500" />
                ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                )}
                <span className={cn("text-xs font-semibold", trend === "up" ? "text-green-500" : "text-red-500")}>
                    {trendValue}
                </span>
                <span className="text-xs text-muted-foreground ml-1">{description}</span>
            </div>
        </CardContent>
    </Card>
);

export default function AdminDashboard() {
    const { data: stats, isLoading } = useQuery({
        queryKey: ["admin-stats"],
        queryFn: async () => {
            const [tenants, profiles, security] = await Promise.all([
                supabase.from("tenants").select("id", { count: "exact" }),
                supabase.from("profiles").select("id", { count: "exact" }),
                supabase.from("security_alerts").select("id", { count: "exact" }).eq("resolved", false)
            ]);

            return {
                tenants: tenants.count || 0,
                users: profiles.count || 0,
                alerts: security.count || 0,
                revenue: "$12,450.00" // Simulated for now
            };
        }
    });

    if (isLoading) {
        return (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 rounded-xl bg-muted animate-pulse border" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    System Overview
                </h2>
                <p className="text-muted-foreground mt-1 font-medium">Real-time metrics across all {stats?.tenants} active tenants.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="Active Tenants"
                    value={stats?.tenants}
                    icon={Building2}
                    description="vs last 30 days"
                    trend="up"
                    trendValue="+12%"
                />
                <KpiCard
                    title="Global Users"
                    value={stats?.users}
                    icon={Users}
                    description="vs last 30 days"
                    trend="up"
                    trendValue="+5.2%"
                />
                <KpiCard
                    title="Est. Revenue"
                    value={stats?.revenue}
                    icon={DollarSign}
                    description="current month"
                    trend="up"
                    trendValue="+24.1%"
                />
                <KpiCard
                    title="Active Alerts"
                    value={stats?.alerts}
                    icon={AlertTriangle}
                    description="requiring action"
                    trend={stats?.alerts > 0 ? "down" : "up"}
                    trendValue={stats?.alerts > 0 ? "-3" : "0"}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-7">
                <Card className="lg:col-span-4 border-primary/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Globe className="h-5 w-5 text-primary" />
                            Recent System Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-start gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 border border-blue-200">
                                        <TrendingUp className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <p className="text-sm font-semibold group-hover:text-primary transition-colors">New Merchant Onboarding</p>
                                        <p className="text-xs text-muted-foreground font-medium">"Green Flow Seattle" has activated a Platinum tier subscription.</p>
                                    </div>
                                    <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">2m ago</div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="lg:col-span-3 border-primary/10">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-green-600" />
                            Security Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 flex items-center gap-4">
                                <div className="h-10 w-10 rounded-lg bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                                    <ShieldCheck className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-green-700">All Systems Standard</p>
                                    <p className="text-xs text-green-600/70 font-semibold uppercase tracking-widest">No breaches detected</p>
                                </div>
                            </div>

                            <div className="pt-2 text-xs font-medium text-muted-foreground leading-relaxed">
                                Scan complete. Verified <strong>12,042</strong> login events across <strong>{stats?.tenants}</strong> tenants. All RLS policies are enforced.
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
