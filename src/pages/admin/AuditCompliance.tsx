import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    ClipboardList,
    Terminal,
    Search,
    Download,
    Palette,
    ShieldCheck,
    Building2,
    User,
    Activity
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default function AuditCompliance() {
    const { data: logs, isLoading } = useQuery({
        queryKey: ["admin-audit-logs"],
        queryFn: async () => {
            // In a real app we'd query super_admin_audit_logs table.
            // Mocking some data since the table is likely empty.
            return [
                {
                    id: "1",
                    admin: "Gabriel Sidor",
                    action: "TENANT_SUSPENDED",
                    target: "Seattle Landscaping",
                    details: "Breach of TOS",
                    timestamp: new Date().toISOString()
                },
                {
                    id: "2",
                    admin: "Gabriel Sidor",
                    action: "PASSWORD_RESET_TRIGGERED",
                    target: "john@example.com",
                    details: "Support ticket #1042",
                    timestamp: new Date(Date.now() - 3600000).toISOString()
                },
                {
                    id: "3",
                    admin: "Gabriel Sidor",
                    action: "LICENSE_UPGRADE",
                    target: "Green Flow NYC",
                    details: "Transition to PLATINUM",
                    timestamp: new Date(Date.now() - 86400000).toISOString()
                }
            ];
        }
    });

    const getActionBadge = (action: string) => {
        if (action.includes("SUSPENDED")) return <Badge variant="destructive">{action}</Badge>;
        if (action.includes("UPGRADE")) return <Badge className="bg-green-600 font-bold">{action}</Badge>;
        return <Badge variant="secondary">{action}</Badge>;
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Audit & Compliance</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Global ledger of administrative actions and high-risk events.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="border-primary/20">
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                    <Button className="shadow-lg shadow-primary/20">
                        <Palette className="h-4 w-4 mr-2" />
                        Brand Control
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase flex items-center justify-between">
                            Log Integrity
                            <ShieldCheck className="h-4 w-4 text-green-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xs font-semibold py-1 px-2 bg-green-500/10 text-green-700 rounded w-fit mb-2">IMMUTABLE</div>
                        <p className="text-xs text-muted-foreground leading-relaxed">All super-admin actions are cryptographically hashed and cannot be purged by standard system users.</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Retention Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold italic">7 Years</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Standard regulatory alignment</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Access History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex -space-x-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-8 w-8 rounded-full bg-slate-200 border-2 border-background flex items-center justify-center text-[10px] font-bold">GS</div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 font-semibold">3 admins active in last 24h</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search logs (Admin name, Target ID, Action type...)" className="pl-10 h-10 border-primary/10 bg-card shadow-sm" />
                </div>
                <Button variant="outline" size="icon" className="h-10 w-10 border-primary/10">
                    <Terminal className="h-4 w-4" />
                </Button>
            </div>

            <Card className="border-primary/10 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Timestamp</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Administrative Agent</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Action</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Subject</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Context / Reason</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8">Loading global ledger...</TableCell></TableRow>
                        ) : logs?.map((log) => (
                            <TableRow key={log.id} className="group hover:bg-muted/30 transition-colors">
                                <TableCell className="text-[10px] font-bold text-muted-foreground">
                                    {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <User className="h-3.5 w-3.5 text-primary" />
                                        <span className="font-bold text-sm">{log.admin}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{getActionBadge(log.action)}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold">{log.target}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Activity className="h-3.5 w-3.5 text-blue-500 opacity-50" />
                                        <span className="text-xs text-muted-foreground italic font-medium">{log.details}</span>
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
