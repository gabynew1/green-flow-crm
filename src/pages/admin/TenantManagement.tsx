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
    AlertCircle
} from "lucide-react";
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
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function TenantManagement() {
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
        const { error } = await supabase
            .from("tenants")
            .update({ status: newStatus } as any)
            .eq("id", id);

        if (error) toast.error(error.message);
        else {
            toast.success(`Tenant status updated to ${newStatus}`);
            refetch();
        }
    };

    const getTierBadge = (tier: string) => {
        switch (tier) {
            case "enterprise": return <Badge className="bg-purple-600 hover:bg-purple-700">Enterprise</Badge>;
            case "pro": return <Badge className="bg-blue-600 hover:bg-blue-700">Pro</Badge>;
            default: return <Badge variant="secondary">Free</Badge>;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "active": return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Active</Badge>;
            case "suspended": return <Badge variant="destructive">Suspended</Badge>;
            case "trial": return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Trial</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (isLoading) return <div className="h-96 rounded-xl bg-muted animate-pulse border" />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Tenant Management</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Configure lifecycles and licensing for all organizations.</p>
                </div>
                <Button className="shadow-lg shadow-primary/20" onClick={() => navigate("/admin/onboard")}>
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
                        <div className="text-2xl font-bold">{tenants?.filter(t => t.status !== 'trial').length || 0} / {tenants?.length || 0}</div>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Converted tenants</p>
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
                        <div className="text-2xl font-bold">{tenants?.filter(t => t.status === 'active').length || 0}</div>
                        <p className="text-xs text-muted-foreground font-medium mt-1">Excluding trials</p>
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
                                <TableCell>{getStatusBadge(tenant.status)}</TableCell>
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
                                            <DropdownMenuItem onClick={() => updateStatus(tenant.id, 'active')}>
                                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                                Activate Account
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => updateStatus(tenant.id, 'suspended')}>
                                                <Ban className="h-4 w-4 mr-2 text-destructive" />
                                                Suspend Account
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem>
                                                <CreditCard className="h-4 w-4 mr-2" />
                                                Change Billing Tier
                                            </DropdownMenuItem>
                                            <DropdownMenuItem>
                                                <Calendar className="h-4 w-4 mr-2" />
                                                Extend Trial
                                            </DropdownMenuItem>
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