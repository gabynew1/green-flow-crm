import { useState } from "react";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { trialDayNumber, getTierConfig, isTrial } from "@/lib/tiers";

function statusDayProgress(tenant: {
    status: string;
    subscription_tier: string;
    created_at: string;
    trial_expires_at: string | null;
    locked_at?: string | null;
}): { day: number; total: number } | null {
    const DAY = 86_400_000;
    const now = Date.now();
    if (tenant.status === "soft_locked" || tenant.status === "flagged_for_deletion") {
        const start = tenant.locked_at ? new Date(tenant.locked_at).getTime() : now;
        const day = Math.min(180, Math.max(1, Math.floor((now - start) / DAY) + 1));
        return { day, total: 180 };
    }
    if (isTrial(tenant.subscription_tier) || tenant.status === "trial") {
        return trialDayNumber(tenant.created_at, tenant.trial_expires_at);
    }
    if (tenant.status === "active") {
        const yearly = /year|annual/i.test(tenant.subscription_tier);
        const total = yearly ? 365 : 30;
        const start = new Date(tenant.created_at).getTime();
        const elapsed = Math.max(0, Math.floor((now - start) / DAY));
        const day = Math.min(total, (elapsed % total) + 1);
        return { day, total };
    }
    return null;
}
import { Plus } from "lucide-react";

type TenantRow = {
    id: string;
    name: string;
    subscription_tier: string;
    status: string;
    created_at: string;
    max_provider_seats: number;
    max_client_seats: number;
    max_teams: number;
    trial_expires_at: string | null;
    locked_at?: string | null;
    scheduled_delete_at?: string | null;
    providerCount: number;
    clientCount: number;
    teamCount: number;
};

export default function TenantManagement() {
    const navigate = useNavigate();
    const [changeTierTenant, setChangeTierTenant] = useState<TenantRow | null>(null);
    const [selectedTier, setSelectedTier] = useState("");
    const [decommissionTenant, setDecommissionTenant] = useState<TenantRow | null>(null);
    const [decommissionConfirm, setDecommissionConfirm] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    const { data: tenants, isLoading, refetch } = useQuery({
        queryKey: ["admin-tenants"],
        queryFn: async () => {
            const { data: tenantsData, error } = await supabase
                .from("tenants")
                .select(`id, name, subscription_tier, status, created_at, max_provider_seats, max_client_seats, max_teams, trial_expires_at, locked_at, scheduled_delete_at`);

            if (error) throw error;

            const enrichedTenants = await Promise.all((tenantsData || []).map(async (t) => {
                const { count: providers } = await supabase
                    .from("profiles")
                    .select("*", { count: "exact", head: true })
                    .eq("tenant_id", t.id);
                const { count: teamsCount } = await supabase
                    .from("teams")
                    .select("*", { count: "exact", head: true })
                    .eq("tenant_id", t.id);

                return {
                    ...t,
                    providerCount: providers || 0,
                    clientCount: 0,
                    teamCount: teamsCount || 0,
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

    const handleChangeTier = async () => {
        if (!changeTierTenant || !selectedTier) return;
        setIsProcessing(true);
        const { error } = await supabase.rpc("apply_tier_limits" as never, {
            _tenant_id: changeTierTenant.id,
            _tier: selectedTier,
        } as never);

        if (error) {
            toast.error(error.message);
        } else {
            toast.success(`Billing tier changed to ${selectedTier}`);
            refetch();
        }
        setIsProcessing(false);
        setChangeTierTenant(null);
        setSelectedTier("");
    };

    const handleExtendTrial15 = async (tenant: TenantRow) => {
        setIsProcessing(true);
        const { data, error } = await supabase.rpc("extend_trial_15" as never, {
            _tenant_id: tenant.id,
        } as never);
        if (error) {
            toast.error(error.message);
        } else {
            toast.success(`Trial extended by 15 days (now expires ${format(new Date(data as unknown as string), "MMM d, yyyy")})`);
            refetch();
        }
        setIsProcessing(false);
    };

    const handleDecommission = async () => {
        if (!decommissionTenant) return;
        if (decommissionConfirm.toLowerCase() !== decommissionTenant.name.toLowerCase()) {
            toast.error("Organization name does not match");
            return;
        }
        setIsProcessing(true);
        const { data, error } = await supabase.functions.invoke('tenant-decommission', {
            body: { tenant_id: decommissionTenant.id, reason: 'manually_decommissioned' },
        });

        if (error) {
            toast.error(error.message);
        } else {
            const sched = (data as any)?.scheduled_delete_at;
            toast.success(
                sched
                  ? `${decommissionTenant.name} locked. Scheduled deletion: ${format(new Date(sched), "MMM d, yyyy")}`
                  : `${decommissionTenant.name} has been locked`
            );
            refetch();
        }
        setIsProcessing(false);
        setDecommissionTenant(null);
        setDecommissionConfirm("");
    };

    const handleReactivate = async (tenant: TenantRow) => {
        setIsProcessing(true);
        const { error } = await supabase.functions.invoke('tenant-reactivate', {
            body: { tenant_id: tenant.id },
        });
        if (error) toast.error(error.message);
        else { toast.success(`${tenant.name} reactivated`); refetch(); }
        setIsProcessing(false);
    };

    const getTierBadge = (tier: string) => {
        const cfg = getTierConfig(tier);
        if (tier === "territory_trial") {
            return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Territory Trial</Badge>;
        }
        const colorMap: Record<string, string> = {
            patio: "bg-stone-500 hover:bg-stone-600",
            backyard: "bg-emerald-500 hover:bg-emerald-600",
            estate: "bg-emerald-700 hover:bg-emerald-800",
            territory: "bg-stone-900 hover:bg-stone-800",
        };
        return <Badge className={colorMap[tier] || "bg-stone-400"}>{cfg.name}</Badge>;
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "active": return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Active</Badge>;
            case "suspended": return <Badge variant="destructive">Suspended</Badge>;
            case "trial": return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Trial</Badge>;
            case "decommissioned": return <Badge variant="outline" className="text-gray-500 border-gray-200 bg-gray-50">Decommissioned</Badge>;
            case "inactivity_warned": return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Inactivity warned</Badge>;
            case "soft_locked": return <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">Soft-locked</Badge>;
            case "flagged_for_deletion": return <Badge variant="destructive">Flagged for deletion</Badge>;
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
                            <TableHead className="font-bold">Days</TableHead>
                            <TableHead className="font-bold">Teams</TableHead>
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
                                    {(() => {
                                        const p = statusDayProgress(tenant);
                                        if (!p) return <span className="text-xs text-muted-foreground">—</span>;
                                        const overdue = p.day >= p.total;
                                        const warn = !overdue && p.total - p.day <= 15;
                                        return (
                                            <span className={cn(
                                                "text-sm font-semibold",
                                                overdue ? "text-destructive" : warn ? "text-amber-600" : "text-foreground"
                                            )}>
                                                Day {p.day} / {p.total}
                                            </span>
                                        );
                                    })()}
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm font-semibold">{tenant.teamCount}</span>
                                    <span className="text-muted-foreground text-xs"> / {tenant.max_teams === 999 ? "∞" : tenant.max_teams}</span>
                                </TableCell>
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
                                    <div className="flex items-center gap-1">
                                        {isTrial(tenant.subscription_tier) && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-8 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                                                onClick={() => handleExtendTrial15(tenant)}
                                                disabled={isProcessing}
                                                title="Extend trial by exactly 15 days"
                                            >
                                                <Plus className="h-3 w-3 mr-1" />15 days
                                            </Button>
                                        )}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            <DropdownMenuLabel>Management Actions</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => updateStatus(tenant.id, 'active')} disabled={tenant.status === 'active'}>
                                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                                Activate Account
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => updateStatus(tenant.id, 'suspended')} disabled={tenant.status === 'suspended'}>
                                                <Ban className="h-4 w-4 mr-2 text-destructive" />
                                                Suspend Account
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => { setChangeTierTenant(tenant); setSelectedTier(tenant.subscription_tier); }}>
                                                <CreditCard className="h-4 w-4 mr-2" />
                                                Change Billing Tier
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleExtendTrial15(tenant)} disabled={isProcessing}>
                                                <Calendar className="h-4 w-4 mr-2" />
                                                Extend Trial +15 days
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                className="text-destructive font-semibold"
                                                disabled={['soft_locked','flagged_for_deletion','decommissioned'].includes(tenant.status)}
                                                onClick={() => setDecommissionTenant(tenant)}
                                            >
                                                <Shield className="h-4 w-4 mr-2" />
                                                Decommission Organization
                                            </DropdownMenuItem>
                                            {['inactivity_warned','soft_locked','flagged_for_deletion'].includes(tenant.status) && (
                                                <DropdownMenuItem onClick={() => handleReactivate(tenant)}>
                                                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                                    Reactivate
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>

            {/* Change Billing Tier Dialog */}
            <Dialog open={!!changeTierTenant} onOpenChange={(open) => { if (!open) setChangeTierTenant(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Billing Tier</DialogTitle>
                        <DialogDescription>
                            Update the subscription tier for <strong>{changeTierTenant?.name}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label>Subscription Tier</Label>
                        <Select value={selectedTier} onValueChange={setSelectedTier}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select tier" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="territory_trial">Territory Trial (90d)</SelectItem>
                                <SelectItem value="patio">Patio (Free)</SelectItem>
                                <SelectItem value="backyard">Backyard (€5)</SelectItem>
                                <SelectItem value="estate">Estate (€30)</SelectItem>
                                <SelectItem value="territory">Territory (€100)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setChangeTierTenant(null)}>Cancel</Button>
                        <Button onClick={handleChangeTier} disabled={isProcessing || selectedTier === changeTierTenant?.subscription_tier}>
                            {isProcessing ? "Saving…" : "Save Changes"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Extend Trial Dialog */}
            {/* Trial extension is now a single +15 days click — see table actions */}

            {/* Decommission Dialog */}
            <Dialog open={!!decommissionTenant} onOpenChange={(open) => { if (!open) { setDecommissionTenant(null); setDecommissionConfirm(""); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive">Decommission Organization</DialogTitle>
                        <DialogDescription>
                            This action will mark <strong>{decommissionTenant?.name}</strong> as decommissioned. All users will lose access. This cannot be easily undone.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                        <Label>Type the organization name to confirm</Label>
                        <Input
                            value={decommissionConfirm}
                            onChange={(e) => setDecommissionConfirm(e.target.value)}
                            placeholder={decommissionTenant?.name}
                        />
                        {decommissionConfirm && decommissionConfirm.toLowerCase() !== decommissionTenant?.name.toLowerCase() && (
                            <p className="text-sm text-destructive">Name does not match</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDecommissionTenant(null); setDecommissionConfirm(""); }}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDecommission}
                            disabled={isProcessing || decommissionConfirm.toLowerCase() !== decommissionTenant?.name.toLowerCase()}
                        >
                            {isProcessing ? "Decommissioning…" : "Decommission"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
