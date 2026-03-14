import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Building2,
    MoreVertical,
    Shield,
    UserPlus,
    Ban,
    Calendar,
    CreditCard,
    CheckCircle2,
    AlertCircle,
    ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

export default function TenantManagement() {
    const { data: plans } = useQuery({
        queryKey: ["admin-billing-plans"],
        queryFn: async () => {
            const { data, error } = await supabase.from("subscription_plans").select("tier").order("monthly_price");
            if (error) throw error;
            return data.map(p => p.tier).filter(t => t !== 'TRIAL'); // Filter out virtual trial tier
        }
    });

    const { data: tenants, isLoading, refetch } = useQuery({
        queryKey: ["admin-tenants"],
        queryFn: async () => {
            const { data: tenantsData, error } = await supabase
                .from("tenants")
                .select(`
          id, 
          name, 
          subscription_tier, 
          status, 
          created_at,
          trial_expires_at,
          max_provider_seats,
          max_client_seats
        `);

            if (error) throw error;

            const enrichedTenants = await Promise.all((tenantsData || []).map(async (t) => {
                const { count: providers } = await supabase
                    .from("profiles")
                    .select("*", { count: "exact", head: true })
                    .eq("tenant_id", t.id);

                return {
                    ...t,
                    providerCount: providers || 0,
                    clientCount: 0
                };
            }));

            return enrichedTenants;
        }
    });

    const updateStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase.from("tenants").update({ status: newStatus } as any).eq("id", id);
        if (error) toast.error(error.message);
        else {
            toast.success(`Tenant status updated to ${newStatus}`);
            refetch();
        }
    };

    const updateTier = async (id: string, newTier: string) => {
        const { error } = await supabase.from("tenants").update({ subscription_tier: newTier, status: 'ACTIVE', trial_expires_at: null } as any).eq("id", id);
        if (error) toast.error(error.message);
        else {
            toast.success(`Tenant upgraded to ${newTier}`);
            refetch();
        }
    };

    const extendTrial = async (id: string, currentExpiry: string | null) => {
        const baseDate = currentExpiry ? new Date(currentExpiry) : new Date();
        const newDate = new Date(baseDate);
        newDate.setDate(newDate.getDate() + 15);

        const { error } = await supabase.from("tenants").update({ trial_expires_at: newDate.toISOString() } as any).eq("id", id);
        if (error) toast.error(error.message);
        else {
            toast.success("Trial extended by 15 days");
            refetch();
        }
    };

    const getTierBadge = (tier: string) => {
        switch (tier) {
            case "PLATINUM": return <Badge className="bg-purple-600 hover:bg-purple-700">Platinum</Badge>;
            case "PREMIUM": return <Badge className="bg-blue-600 hover:bg-blue-700">Premium</Badge>;
            default: return <Badge variant="secondary">Basic</Badge>;
        }
    };

    const renderStatus = (t: any) => {
        if (t.status === 'SUSPENDED') return <Badge variant="destructive">Suspended</Badge>;
        if (t.status === 'TRIAL' && t.trial_expires_at) {
            const daysLeft = differenceInDays(new Date(t.trial_expires_at), new Date());
            if (daysLeft < 0) {
                return (
                    <div className="flex flex-col gap-1 items-start">
                        <Badge variant="outline" className="text-destructive border-destructive">Trial Expired</Badge>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Downgrading to Basic...</span>
                    </div>
                );
            }
            return (
                <div className="flex flex-col gap-1 items-start">
                    <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Trial Active</Badge>
                    <span className="text-[10px] text-amber-700 font-semibold whitespace-nowrap">{daysLeft} days left</span>
                </div>
            );
        }
        return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Active</Badge>;
    };

    if (isLoading) return <div className="h-96 rounded-xl bg-muted animate-pulse border" />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Configure lifecycles and licensing for all organizations.</p>
                </div>
                <Button className="shadow-lg shadow-primary/20">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create New Tenant
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Trial Conversions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">84%</div>
                        <p className="text-xs text-green-500 font-semibold mt-1">+4% from last month</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Over-Quota Alerts</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-destructive">
                            {tenants?.filter(t => t.providerCount >= (t.max_provider_seats || 2)).length || 0}
                        </div>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Tenants exceeded seat limits</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Active Subscriptions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{tenants?.filter(t => t.status === 'ACTIVE').length}</div>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Excluding trials / suspended</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/10 overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold">Organization</TableHead>
                            <TableHead className="font-bold">Tier</TableHead>
                            <TableHead className="font-bold">Status</TableHead>
                            <TableHead className="font-bold">Providers</TableHead>
                            <TableHead className="font-bold">Created</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants?.map((tenant) => (
                            <TableRow key={tenant.id} className="group transition-colors hover:bg-primary/5">
                                <TableCell className="font-medium">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <Building2 className="h-4 w-4 text-primary" />
                                        </div>
                                        <span>{tenant.name}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{getTierBadge(tenant.subscription_tier)}</TableCell>
                                <TableCell>{renderStatus(tenant)}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "font-bold",
                                            tenant.providerCount >= (tenant.max_provider_seats || 2) ? "text-destructive" : "text-foreground"
                                        )}>
                                            {tenant.providerCount}
                                        </span>
                                        <span className="text-muted-foreground">/ {tenant.max_provider_seats || 2}</span>
                                        {tenant.providerCount >= (tenant.max_provider_seats || 2) && (
                                            <AlertCircle className="h-3 w-3 text-destructive" />
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground text-xs font-medium">
                                    {format(new Date(tenant.created_at), "MMM d, yyyy")}
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel>Management Actions</DropdownMenuLabel>
                                            <DropdownMenuSeparator />

                                            {tenant.status !== 'ACTIVE' && (
                                                <DropdownMenuItem onClick={() => updateStatus(tenant.id, 'ACTIVE')}>
                                                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                                    Activate Account
                                                </DropdownMenuItem>
                                            )}

                                            {tenant.status !== 'SUSPENDED' && (
                                                <DropdownMenuItem onClick={() => updateStatus(tenant.id, 'SUSPENDED')}>
                                                    <Ban className="h-4 w-4 mr-2 text-destructive" />
                                                    Suspend Account
                                                </DropdownMenuItem>
                                            )}

                                            <DropdownMenuSeparator />

                                            {/* Tier Changer */}
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger>
                                                    <CreditCard className="h-4 w-4 mr-2" />
                                                    <span>Change Billing Tier</span>
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent>
                                                    {plans?.map(tier => (
                                                        <DropdownMenuItem
                                                            key={tier}
                                                            onClick={() => updateTier(tenant.id, tier)}
                                                            className={tenant.subscription_tier === tier ? "bg-accent" : ""}
                                                            disabled={tenant.subscription_tier === tier}
                                                        >
                                                            {tier}
                                                            {tenant.subscription_tier === tier && <CheckCircle2 className="h-3 w-3 ml-2 text-green-500" />}
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>

                                            {tenant.status === 'TRIAL' && (
                                                <DropdownMenuItem onClick={() => extendTrial(tenant.id, tenant.trial_expires_at)}>
                                                    <Calendar className="h-4 w-4 mr-2 text-amber-500" />
                                                    Extend Trial (+15 Days)
                                                </DropdownMenuItem>
                                            )}

                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive font-semibold">
                                                <Shield className="h-4 w-4 mr-2" />
                                                Decommission Organization
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
