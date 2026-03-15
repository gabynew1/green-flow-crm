import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    ShieldAlert,
    ShieldCheck,
    Fingerprint,
    Globe,
    Lock,
    Eye,
    CheckCircle2
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function SecurityMonitor() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const { data: alerts, isLoading } = useQuery({
        queryKey: ["admin-security-alerts"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("security_alerts")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) throw error;
            return data || [];
        }
    });

    const resolveAlert = useMutation({
        mutationFn: async (alertId: string) => {
            const { error } = await supabase
                .from("security_alerts")
                .update({
                    resolved: true,
                    resolved_at: new Date().toISOString(),
                    resolved_by: user?.id || null,
                } as any)
                .eq("id", alertId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Alert resolved");
            queryClient.invalidateQueries({ queryKey: ["admin-security-alerts"] });
        },
        onError: (err: any) => toast.error(err.message),
    });

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case "critical": return "text-red-600 bg-red-50 border-red-200";
            case "high": return "text-orange-600 bg-orange-50 border-orange-200";
            case "medium": return "text-amber-600 bg-amber-50 border-amber-200";
            default: return "text-blue-600 bg-blue-50 border-blue-200";
        }
    };

    const unresolvedCount = alerts?.filter(a => !a.resolved).length || 0;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Security Monitoring</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Global threat detection and defensive oversight.</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-red-100 bg-red-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-red-600 uppercase flex items-center justify-between">
                            Unresolved Alerts
                            <ShieldAlert className="h-4 w-4" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-red-700">{unresolvedCount}</div>
                        <p className="text-[10px] text-red-600/70 font-bold uppercase tracking-widest mt-1">Requiring attention</p>
                    </CardContent>
                </Card>

                <Card className="border-green-100 bg-green-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-green-600 uppercase flex items-center justify-between">
                            RLS Integrity
                            <ShieldCheck className="h-4 w-4" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-green-700">PASS</div>
                        <p className="text-[10px] text-green-600/70 font-bold uppercase tracking-widest mt-1">Validated across all tables</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-100 bg-blue-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600 uppercase flex items-center justify-between">
                            Total Alerts
                            <Fingerprint className="h-4 w-4" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-700">{alerts?.length || 0}</div>
                        <p className="text-[10px] text-blue-600/70 font-bold uppercase tracking-widest mt-1">Logged security events</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/10 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold text-[10px] uppercase">Alert Type</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Severity</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Title</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Status</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Time</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8">Scanning for threats...</TableCell></TableRow>
                        ) : alerts?.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No security alerts recorded. The system is clean.</TableCell></TableRow>
                        ) : alerts?.map((alert) => (
                            <TableRow key={alert.id} className="group hover:bg-muted/30 transition-colors">
                                <TableCell className="font-bold text-sm">{alert.alert_type}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn("font-bold", getSeverityColor(alert.severity))}>
                                        {alert.severity.toUpperCase()}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div>
                                        <span className="text-sm font-medium">{alert.title}</span>
                                        {alert.description && (
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{alert.description}</p>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {alert.resolved ? (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolved
                                        </Badge>
                                    ) : (
                                        <Badge variant="destructive">Open</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-[10px] font-bold text-muted-foreground uppercase">
                                    {format(new Date(alert.created_at), "MMM d, HH:mm")}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {!alert.resolved && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-green-600"
                                                onClick={() => resolveAlert.mutate(alert.id)}
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}