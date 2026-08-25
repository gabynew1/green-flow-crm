import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExternalLink, RefreshCw, RotateCw, Eye, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const TIME_RANGES = [
  { label: "Last 24h", value: "24h", since: () => new Date(Date.now() - 86_400_000) },
  { label: "Last 7 days", value: "7d", since: () => new Date(Date.now() - 7 * 86_400_000) },
  { label: "Last 30 days", value: "30d", since: () => new Date(Date.now() - 30 * 86_400_000) },
  { label: "All time", value: "all", since: () => new Date("2000-01-01T00:00:00Z") },
];

/** Internal handoff states — we track the journey to Resend, not delivery. */
const STATUS_LABELS: Record<string, string> = {
  pending: "Queued",
  rate_limited: "Processing (throttled)",
  sent: "Handed to Resend",
  failed: "Failed (internal)",
  dlq: "Failed (internal, DLQ)",
  suppressed: "Suppressed",
  bounced: "Bounced",
  complained: "Complained",
};

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  rate_limited: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  failed: "bg-red-500/10 text-red-700 border-red-500/30",
  dlq: "bg-red-500/10 text-red-700 border-red-500/30",
  bounced: "bg-red-500/10 text-red-700 border-red-500/30",
  complained: "bg-red-500/10 text-red-700 border-red-500/30",
  suppressed: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
};

export default function EmailActivityTab() {
  const [range, setRange] = useState("30d");
  const [status, setStatus] = useState<string>("all");
  const [template, setTemplate] = useState<string>("all");
  const [recipient, setRecipient] = useState("");
  const [page, setPage] = useState(0);
  const [payload, setPayload] = useState<any>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const since = TIME_RANGES.find((r) => r.value === range)!.since().toISOString();

  const stats = useQuery({
    queryKey: ["email-stats", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_email_activity_stats", {
        p_since: since,
      });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  const templates = useQuery({
    queryKey: ["email-templates-distinct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("template_name")
        .not("template_name", "is", null)
        .limit(1000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.template_name))).sort();
    },
  });

  const activity = useQuery({
    queryKey: ["email-activity", range, status, template, recipient, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_email_activity", {
        p_since: since,
        p_status: status === "all" ? null : status,
        p_template: template === "all" ? null : template,
        p_recipient: recipient || null,
        p_limit: 50,
        p_offset: page * 50,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Live queue depth — the queue itself is the "pending" log (no pending rows).
  const queueDepth = useQuery({
    queryKey: ["email-queue-depth"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_email_health");
      if (error) throw error;
      return ((data as any)?.pending ?? 0) as number;
    },
    refetchInterval: 20_000,
  });

  const totalCount = activity.data?.[0]?.total_count ?? 0;

  async function handleResend(messageId: string) {
    setResendingId(messageId);
    try {
      const { data, error } = await supabase.functions.invoke("admin-email-ops", {
        body: { action: "resend", message_id: messageId },
      });
      if (error) throw error;
      toast({ title: "Resent", description: `New message ID: ${data?.new_message_id ?? "—"}` });
      activity.refetch();
      stats.refetch();
    } catch (e: any) {
      toast({ title: "Resend failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setResendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {stats.isError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Could not load email stats: {(stats.error as any)?.message ?? String(stats.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => stats.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          [
            "In queue (now)",
            queueDepth.isError ? "—" : queueDepth.data ?? 0,
            queueDepth.isError ? "text-muted-foreground" : "text-amber-600",
          ],
          ["Total", stats.data?.total ?? 0, "text-foreground"],
          ["Sent", stats.data?.sent ?? 0, "text-emerald-600"],
          ["Failed", stats.data?.failed ?? 0, "text-red-600"],
          ["DLQ", stats.data?.dlq ?? 0, "text-red-600"],
          ["Suppressed", stats.data?.suppressed ?? 0, "text-yellow-600"],
        ].map(([label, value, cls]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`text-2xl font-bold ${cls}`}>{value as string | number}</p>
              {label === "In queue (now)" && queueDepth.isError && (
                <p className="text-[11px] text-muted-foreground mt-1">Unavailable</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>


      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Select value={range} onValueChange={(v) => { setRange(v); setPage(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Handed to Resend</SelectItem>
              <SelectItem value="pending">Queued</SelectItem>
              <SelectItem value="failed">Failed (internal)</SelectItem>
              <SelectItem value="dlq">Failed (internal, DLQ)</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="complained">Complained</SelectItem>
            </SelectContent>
          </Select>

          <Select value={template} onValueChange={(v) => { setTemplate(v); setPage(0); }}>
            <SelectTrigger><SelectValue placeholder="Template" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {(templates.data ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Recipient email…"
            value={recipient}
            onChange={(e) => { setRecipient(e.target.value); setPage(0); }}
          />

          <Button variant="outline" onClick={() => { activity.refetch(); stats.refetch(); }}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Resend</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                </TableCell></TableRow>
              )}
              {activity.isError && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center space-y-2">
                  <p className="text-sm text-destructive flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Could not load the activity log.
                  </p>
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {(activity.error as any)?.message ?? String(activity.error)}
                  </p>
                </TableCell></TableRow>
              )}
              {!activity.isLoading && !activity.isError && (activity.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No emails in this period.
                </TableCell></TableRow>
              )}
              {(activity.data ?? []).map((row) => (
                <TableRow key={row.message_id}>
                  <TableCell className="font-mono text-xs">{row.template_name}</TableCell>
                  <TableCell className="text-sm">{row.recipient_email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.tenant_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLORS[row.status] ?? ""}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                    {row.error_message && (
                      <p className="text-xs text-red-600 mt-1 max-w-xs truncate" title={row.error_message}>
                        {row.error_message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.resend_id ? (
                      <a
                        href={`https://resend.com/emails/${row.resend_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-primary hover:underline inline-flex items-center gap-1"
                        title="Open in Resend"
                      >
                        {String(row.resend_id).slice(0, 8)}…
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => window.open(`/emails/view/${row.message_id}`, "_blank")}
                        title="View in browser"
                      ><ExternalLink className="h-4 w-4" /></Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => setPayload(row)}
                        title="Inspect payload"
                      ><Eye className="h-4 w-4" /></Button>
                      {(row.status === "failed" || row.status === "dlq") && (
                        <Button
                          size="sm" variant="ghost"
                          disabled={resendingId === row.message_id}
                          onClick={() => handleResend(row.message_id)}
                          title="Resend"
                        >
                          {resendingId === row.message_id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RotateCw className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalCount > 50 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {Math.ceil(totalCount / 50)} · {totalCount} total
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline"
                  disabled={(page + 1) * 50 >= totalCount}
                  onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payload inspector */}
      <Dialog open={!!payload} onOpenChange={(o) => !o && setPayload(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email payload</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-muted p-4 rounded-md overflow-auto max-h-[60vh]">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}