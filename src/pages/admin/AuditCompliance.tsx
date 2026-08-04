import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Search,
    Download,
    ShieldCheck,
    Building2,
    User,
    ChevronDown,
    ChevronRight
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
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

    // Resolve human names for admins and tenant targets
    const { data: nameMaps } = useQuery({
        queryKey: ["admin-audit-names", (logs || []).map(l => l.id).join(",")],
        enabled: !!logs && logs.length > 0,
        queryFn: async () => {
            const adminIds = Array.from(new Set((logs || []).map(l => l.admin_user_id).filter(Boolean))) as string[];
            const tenantIds = Array.from(new Set((logs || [])
                .filter(l => (l.target_type || "").toLowerCase().includes("tenant"))
                .map(l => l.target_id)
                .filter(Boolean))) as string[];

            const admins: Record<string, string> = {};
            const tenants: Record<string, string> = {};

            if (adminIds.length) {
                const { data } = await supabase
                    .from("profiles")
                    .select("user_id, full_name, email")
                    .in("user_id", adminIds);
                (data || []).forEach(p => { admins[p.user_id] = p.full_name || p.email || ""; });
            }
            if (tenantIds.length) {
                const { data } = await supabase
                    .from("tenants")
                    .select("id, name")
                    .in("id", tenantIds);
                (data || []).forEach(t => { tenants[t.id] = t.name; });
            }
            return { admins, tenants };
        }
    });

    const prettyWords = (v: string) =>
        v.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    const actionLabel = (action: string) => prettyWords(action);

    const adminName = (id: string | null) =>
        (id && nameMaps?.admins?.[id]) || (id ? `Admin ${id.slice(0, 8)}` : "System");

    const describe = (log: any): string => {
        const meta = (log.metadata || {}) as Record<string, unknown>;
        const who = adminName(log.admin_user_id);
        const what = shortTarget(log);
        const all: string[] = [];

        // Only mention real transitions (skip no-op from === to).
        if (normalize(log.from_tier) !== normalize(log.to_tier)) {
            if (log.from_tier && log.to_tier) all.push(`changed plan from ${prettyWords(log.from_tier)} to ${prettyWords(log.to_tier)}`);
            else if (log.to_tier) all.push(`set plan to ${prettyWords(log.to_tier)}`);
            else if (log.from_tier) all.push(`removed plan ${prettyWords(log.from_tier)}`);
        }
        if (normalize(log.from_status) !== normalize(log.to_status)) {
            if (log.from_status && log.to_status) all.push(`changed status from ${prettyWords(log.from_status)} to ${prettyWords(log.to_status)}`);
            else if (log.to_status) all.push(`set status to ${prettyWords(log.to_status)}`);
            else if (log.from_status) all.push(`cleared status ${prettyWords(log.from_status)}`);
        }
        all.push(...metaPhrases(meta));

        // Cap the sentence at two clauses; the rest lives behind Details.
        const parts = all.slice(0, 2);
        const overflow = all.length - parts.length;

        const verb = parts.length ? parts.join(" and ") : `performed ${actionLabel(log.action).toLowerCase()}`;

        const rawReason = (log.reason as string) || (typeof meta.reason === "string" ? meta.reason : null);
        const reasonKey = normalize(rawReason);
        const redundant = !rawReason
            || normalize(log.action).includes(reasonKey)
            || reasonKey.includes(normalize(log.action))
            || parts.some(p => normalize(p).includes(reasonKey))
            || (reasonKey.includes("trial") && normalize(verb).includes("extradays"));
        const reason = redundant ? null : prettyWords(String(rawReason));

        return `${who} ${verb}${what ? ` ${parts.length ? "to" : "for"} ${what}` : ""}${reason ? ` — reason: ${reason}` : ""}.${overflow > 0 ? ` +${overflow} more details` : ""}`;
    };

    // Short target label: prefer the resolved name alone, fall back to type/id.
    const shortTarget = (log: { target_type: string | null; target_id: string | null }) => {
        if (!log.target_id) return log.target_type ? prettyWords(log.target_type) : null;
        const resolved = nameMaps?.tenants?.[log.target_id];
        if (resolved) return `“${resolved}”`;
        const type = log.target_type ? prettyWords(log.target_type) : "Record";
        return `${type} ${log.target_id.slice(0, 8)}`;
    };

    // Generic phrasings for known metadata keys. Unknown keys stay in Details only.
    const metaPhrases = (meta: Record<string, unknown>): string[] => {
        const out: string[] = [];
        if (typeof meta.days === "number") out.push(`granted ${meta.days} extra days`);
        if (typeof meta.amount === "number") out.push(`amount ${meta.amount}`);
        if (typeof meta.count === "number") out.push(`${meta.count} records affected`);
        if (typeof meta.email === "string") out.push(`for ${meta.email}`);
        if (typeof meta.plan === "string") out.push(`plan ${prettyWords(meta.plan)}`);
        return out;
    };

    const normalize = (v: unknown) => String(v ?? "").toLowerCase().replace(/[_\s-]+/g, "");

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
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">Action</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px]">What happened</TableHead>
                            <TableHead className="font-bold uppercase tracking-widest text-[10px] w-[110px]">Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8">Loading global ledger...</TableCell></TableRow>
                        ) : logs?.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit logs recorded yet. Actions will appear here automatically.</TableCell></TableRow>
                        ) : logs?.map((log) => (
                            <Fragment key={log.id}>
                                <TableRow className="group hover:bg-muted/30 transition-colors">
                                    <TableCell className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                                        {format(new Date(log.created_at), "d MMM yyyy, HH:mm")}
                                    </TableCell>
                                    <TableCell>{getActionBadge(actionLabel(log.action))}</TableCell>
                                    <TableCell>
                                        <div className="flex items-start gap-2">
                                            <User className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                            <span className="text-xs font-medium leading-relaxed">{describe(log)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-[11px] font-semibold"
                                            onClick={() => setExpanded(prev => ({ ...prev, [log.id]: !prev[log.id] }))}
                                        >
                                            {expanded[log.id]
                                                ? <ChevronDown className="h-3.5 w-3.5 mr-1" />
                                                : <ChevronRight className="h-3.5 w-3.5 mr-1" />}
                                            Details
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                {expanded[log.id] && (
                                    <TableRow className="bg-muted/20 hover:bg-muted/20">
                                        <TableCell colSpan={4} className="py-3">
                                            <div className="grid gap-2 md:grid-cols-2 text-[11px] font-mono">
                                                <div><span className="text-muted-foreground">Timestamp: </span>{format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}</div>
                                                <div><span className="text-muted-foreground">Admin user ID: </span>{log.admin_user_id || "system"}</div>
                                                <div><span className="text-muted-foreground">Raw action: </span>{log.action}</div>
                                                <div className="flex items-center gap-1">
                                                    <Building2 className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-muted-foreground">Target: </span>{log.target_type || "—"} {log.target_id || ""}
                                                </div>
                                                {(log.from_status || log.to_status) && (
                                                    <div><span className="text-muted-foreground">Status: </span>{log.from_status || "—"} → {log.to_status || "—"}</div>
                                                )}
                                                {(log.from_tier || log.to_tier) && (
                                                    <div><span className="text-muted-foreground">Tier: </span>{log.from_tier || "—"} → {log.to_tier || "—"}</div>
                                                )}
                                                {log.reason && <div><span className="text-muted-foreground">Reason: </span>{log.reason}</div>}
                                                <div className="md:col-span-2">
                                                    <span className="text-muted-foreground">Metadata: </span>
                                                    <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-background p-2 border">{JSON.stringify(log.metadata || {}, null, 2)}</pre>
                                                </div>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </Fragment>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}