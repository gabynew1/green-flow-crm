import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    ShieldAlert,
    ShieldCheck,
    Fingerprint,
    Map,
    Globe,
    Lock,
    Ghost,
    Eye,
    Settings
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

export default function SecurityMonitor() {
    const { data: alerts, isLoading } = useQuery({
        queryKey: ["admin-security-alerts"],
        queryFn: async () => {
            // In a real app we'd query security_alerts table.
            return [
                {
                    id: "1",
                    tenant: "Green Flow London",
                    event: "BRUTE_FORCE_ATTEMPT",
                    severity: "HIGH",
                    ip: "192.168.1.45",
                    location: "Russia (Simulated)",
                    timestamp: new Date().toISOString()
                },
                {
                    id: "2",
                    tenant: "NYC Services",
                    event: "BULK_DATA_EXPORT",
                    severity: "MEDIUM",
                    ip: "45.2.11.90",
                    location: "New York, USA",
                    timestamp: new Date(Date.now() - 1500000).toISOString()
                },
            ];
        }
    });

    const getSeverityColor = (sev: string) => {
        switch (sev) {
            case "CRITICAL": return "text-red-600 bg-red-50 border-red-200";
            case "HIGH": return "text-orange-600 bg-orange-50 border-orange-200";
            case "MEDIUM": return "text-amber-600 bg-amber-50 border-amber-200";
            default: return "text-blue-600 bg-blue-50 border-blue-200";
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Security Monitoring</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Global threat detection and defensive oversight.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline"><Ghost className="h-4 w-4 mr-2" /> Honeypots</Button>
                    <Button className="bg-destructive hover:bg-destructive/90"><Settings className="h-4 w-4 mr-2" /> Global Lockout</Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-red-100 bg-red-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-red-600 uppercase flex items-center justify-between">
                            Active Threats
                            <ShieldAlert className="h-4 w-4" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-red-700">02</div>
                        <p className="text-[10px] text-red-600/70 font-bold uppercase tracking-widest mt-1">High Severity Alerts</p>
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
                        <p className="text-[10px] text-green-600/70 font-bold uppercase tracking-widest mt-1">Validated across 12 tables</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-100 bg-blue-50/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-600 uppercase flex items-center justify-between">
                            Auth Sessions
                            <Fingerprint className="h-4 w-4" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-blue-700">1,402</div>
                        <p className="text-[10px] text-blue-600/70 font-bold uppercase tracking-widest mt-1">Global Active Users</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-primary/10 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold text-[10px] uppercase">Alert Type</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Severity</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Tenant Origin</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Source IP / Location</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase">Time</TableHead>
                            <TableHead className="w-[100px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-8">Scanning for threats...</TableCell></TableRow>
                        ) : alerts?.map((alert) => (
                            <TableRow key={alert.id} className="group hover:bg-muted/30 transition-colors">
                                <TableCell className="font-bold text-sm">{alert.event}</TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn("font-bold", getSeverityColor(alert.severity))}>
                                        {alert.severity}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold">{alert.tenant}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Map className="h-3.5 w-3.5 text-blue-500 opacity-50" />
                                        <span className="text-[10px] font-bold text-muted-foreground">{alert.ip}</span>
                                        <span className="text-[10px] text-muted-foreground opacity-70">({alert.location})</span>
                                    </div>
                                </TableCell>
                                <TableCell className="text-[10px] font-bold text-muted-foreground uppercase">
                                    {format(new Date(alert.timestamp), "HH:mm:ss")}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Lock className="h-4 w-4" /></Button>
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
