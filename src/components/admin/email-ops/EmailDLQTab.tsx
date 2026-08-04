import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RotateCw, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { invokeEmailOps } from "./emailOpsActions";

type DLQRow = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: any;
  last_error?: string | null;
  last_status?: string | null;
};

function relativeAge(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function DLQList({ queue }: { queue: "auth_emails" | "transactional_emails" }) {
  const qc = useQueryClient();
  const [actingId, setActingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["dlq", queue],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_dlq", {
        p_queue: queue, p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as unknown as DLQRow[];
    },
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const allSelected = rows.length > 0 && selected.length === rows.length;

  function refreshAll() {
    setSelected([]);
    q.refetch();
    qc.invalidateQueries({ queryKey: ["email-alerts"] });
    qc.invalidateQueries({ queryKey: ["email-health"] });
  }

  async function act(action: "replay_dlq" | "discard_dlq", msgId: number) {
    setActingId(msgId);
    try {
      await invokeEmailOps({ action, queue, msg_id: msgId });
      toast({
        title: action === "replay_dlq" ? "Sent back to the queue" : "Discarded",
        description: `Message ${msgId}`,
      });
      refreshAll();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setActingId(null);
    }
  }

  async function bulk(action: "replay_dlq_bulk" | "discard_dlq_bulk") {
    const ids = selected.length > 0 ? selected : rows.map((r) => r.msg_id);
    if (ids.length === 0) return;
    setBulkBusy(action);
    try {
      const res = await invokeEmailOps({ action, queue, msg_ids: ids });
      toast({
        title: action === "replay_dlq_bulk" ? "Retry queued" : "Discarded",
        description: `${res.processed ?? 0} message(s) processed.`,
      });
      refreshAll();
    } catch (e: any) {
      toast({ title: "Bulk action failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBulkBusy(null);
    }
  }

  const scopeLabel = selected.length > 0 ? `${selected.length} selected` : "all";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base">
          {queue === "transactional_emails" ? "App emails" : "Auth emails"} dead-letter ({rows.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={rows.length === 0 || !!bulkBusy}
            onClick={() => bulk("replay_dlq_bulk")}
          >
            {bulkBusy === "replay_dlq_bulk"
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RotateCw className="h-4 w-4 mr-2" />}
            Retry {scopeLabel}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={rows.length === 0 || !!bulkBusy}>
                <Trash2 className="h-4 w-4 mr-2" /> Discard {scopeLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard {scopeLabel} message(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  These emails will be permanently deleted and never sent. This action is logged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => bulk("discard_dlq_bulk")}
                >
                  Discard
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  aria-label="Select all"
                  onCheckedChange={(v) =>
                    setSelected(v ? rows.map((r) => r.msg_id) : [])
                  }
                />
              </TableHead>
              <TableHead>Msg ID</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </TableCell></TableRow>
            )}
            {q.isError && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center space-y-2">
                <p className="text-sm text-destructive flex items-center justify-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Could not load the dead-letter queue.
                </p>
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {(q.error as any)?.message ?? String(q.error)}
                </p>
              </TableCell></TableRow>
            )}
            {!q.isLoading && !q.isError && rows.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                Nothing here — every email was handed off to Resend.
              </TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.msg_id}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(r.msg_id)}
                    aria-label={`Select ${r.msg_id}`}
                    onCheckedChange={(v) =>
                      setSelected((prev) =>
                        v ? [...prev, r.msg_id] : prev.filter((id) => id !== r.msg_id)
                      )
                    }
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">{r.msg_id}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  <span title={new Date(r.enqueued_at).toLocaleString()}>
                    {relativeAge(r.enqueued_at)}
                  </span>
                  <span className="ml-1 opacity-60">· {r.read_ct} tries</span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.message?.template ?? r.message?.template_name ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {r.message?.to ?? r.message?.recipient_email ?? "—"}
                </TableCell>
                <TableCell className="text-xs max-w-[280px]">
                  {r.last_error ? (
                    <span className="text-destructive break-words line-clamp-3" title={r.last_error}>
                      {r.last_error}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Worker gave up after {r.read_ct} attempt(s)
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost"
                      disabled={actingId === r.msg_id}
                      onClick={() => act("replay_dlq", r.msg_id)}
                      title="Retry">
                      {actingId === r.msg_id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RotateCw className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Discard">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Discard message?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes message {r.msg_id} from the
                            dead-letter queue. The action is logged.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => act("discard_dlq", r.msg_id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Discard
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function EmailDLQTab() {
  return (
    <Tabs defaultValue="transactional_emails" className="space-y-4">
      <TabsList>
        <TabsTrigger value="transactional_emails">Transactional</TabsTrigger>
        <TabsTrigger value="auth_emails">Auth</TabsTrigger>
      </TabsList>
      <TabsContent value="transactional_emails">
        <DLQList queue="transactional_emails" />
      </TabsContent>
      <TabsContent value="auth_emails">
        <DLQList queue="auth_emails" />
      </TabsContent>
    </Tabs>
  );
}
