import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    ClipboardList,
    Terminal,
    Search,
    Download,
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
import { toast } from "sonner";

export default function AuditCompliance() {
    const [searchTerm, setSearchTerm] = useState("");

    const { data: logs, isLoading } = useQuery({
        queryKey: ["admin-audit-logs", searchTerm],
        queryFn: async () => {
            let query = supabase
                .from("super_admin_audit_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(100);

            if (searchTerm) {
                query = query.or(`action.ilike.%${searchTerm}%,target_type.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        }
    });

    const getActionBadge = (action: string) => {
        if (action.includes("SUSPEND") || action.includes("LOCK")) return <Badge variant="destructive">{action}</Badge>;
        if (action.includes("UPGRADE") || action.includes("ACTIVATE")) return <Badge className="bg-green-600 font-bold">{action}</Badge>;
        return <Badge variant="secondary">{action}</Badge>;
    };

    const handleExportCSV = () => {
        if (!logs || logs.length === 0) return;
        const headers = ["Timestamp", "Admin User ID", "Action", "Target Type", "Target ID", "Metadata"];
        const rows = logs.map(log => [
            log.created_at,
            log.admin_user_id,
            log.action,
            log.target_type || "",
            log.target_id || "",
            JSON.stringify(log.metadata || {}),
        ].map(v => `"${v}"`).join(","));
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("CSV exported");
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Audit & Compliance</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Global ledger of administrative actions and high-risk events.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="border-primary/20" onClick={handleExportCSV} disabled={!logs || logs.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
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
                        <p className="text-xs text-muted-foreground leading-relaxed">All super-admin actions are logged and cannot be purged by standard system users.</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Total Log Entries</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{logs?.length || 0}</div>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">Audit records loaded</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground uppercase">Access History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex -space-x-2">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-bold">GS</div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 font-semibold">Admin access</p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search logs (Action type, Target type...)"
                        className="pl-10 h-10 border-primary/10 bg-card shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <Card className="border-primary/10 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Timestamp</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Admin</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Action</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Target</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8">Loading global ledger...</TableCell></TableRow>
                        ) : logs?.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs recorded yet. Actions will appear here automatically.</TableCell></TableRow>
                        ) : logs?.map((log) => (
                            <TableRow key={log.id} className="group hover:bg-muted/30 transition-colors">
                                <TableCell className="text-[10px] font-bold text-muted-foreground">
                                    {format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <User className="h-3.5 w-3.5 text-primary" />
                                        <span className="font-bold text-xs font-mono">{log.admin_user_id.slice(0, 8)}…</span>
                                    </div>
                                </TableCell>
                                <TableCell>{getActionBadge(log.action)}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs font-semibold">{log.target_type || "—"}</span>
                                        {log.target_id && <span className="text-[10px] text-muted-foreground font-mono">{log.target_id.slice(0, 8)}</span>}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Activity className="h-3.5 w-3.5 text-primary/40" />
                                        <span className="text-xs text-muted-foreground italic font-medium">
                                            {log.metadata && Object.keys(log.metadata as object).length > 0
                                                ? JSON.stringify(log.metadata).slice(0, 60)
                                                : "—"}
                                        </span>
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