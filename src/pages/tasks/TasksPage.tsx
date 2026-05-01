import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useActionTasks, actOnTask, ActionTaskRow } from "@/hooks/useActionTasks";
import { useNotifications } from "@/hooks/useNotifications";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Inbox, History, AlertCircle } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApproveLinkDialog } from "@/components/client/ApproveLinkDialog";

const TYPE_LABEL: Record<string, string> = {
  link_request: "Property link request",
  offer_response: "Offer response",
  contract_response: "Contract response",
  inspection_confirmation: "Inspection confirmation",
  contract_renewal: "Contract renewal",
};

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

export default function TasksPage() {
  const { user, isClient, isProvider } = useAuth();
  const { pendingForMe, mineInitiated, loading, reload } = useActionTasks();
  const { items: notifications, markRead } = useNotifications(50);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedId = searchParams.get("task");
  const [selected, setSelected] = useState<ActionTaskRow | null>(null);
  const [actionDialog, setActionDialog] = useState<null | "approve" | "reject">(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [linkApproveTaskId, setLinkApproveTaskId] = useState<string | null>(null);
  const [linkApproveTenant, setLinkApproveTenant] = useState<string | null>(null);

  // Auto-select task from URL
  useEffect(() => {
    if (!focusedId) return;
    const all = [...pendingForMe, ...mineInitiated];
    const t = all.find((x) => x.id === focusedId);
    if (t) setSelected(t);
  }, [focusedId, pendingForMe, mineInitiated]);

  // Load detail (events + comments) when a task is selected
  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setComments([]);
      return;
    }
    (async () => {
      const [{ data: ev }, { data: cm }] = await Promise.all([
        supabase.from("action_task_events").select("*").eq("task_id", selected.id).order("created_at"),
        supabase.from("action_task_comments").select("*").eq("task_id", selected.id).order("created_at"),
      ]);
      setEvents(ev ?? []);
      setComments(cm ?? []);
    })();
  }, [selected]);

  const submitAction = async () => {
    if (!selected || !actionDialog) return;
    if (actionDialog === "reject" && !comment.trim()) {
      toast.error("A comment is required when rejecting");
      return;
    }
    setSubmitting(true);
    try {
      await actOnTask(selected.id, actionDialog, comment.trim() || undefined);
      toast.success(actionDialog === "approve" ? "Task approved" : "Task rejected");
      setActionDialog(null);
      setComment("");
      setSelected(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const isMyTask = (t: ActionTaskRow) =>
    t.target_user_id === user?.id || t.target_user_id === null;

  const renderTaskRow = (t: ActionTaskRow, opts: { incoming: boolean }) => (
    <button
      key={t.id}
      onClick={() => {
        setSelected(t);
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("task", t.id);
          return next;
        });
      }}
      className={cn(
        "block w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40",
        selected?.id === t.id && "border-primary/60 bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{TYPE_LABEL[t.task_type] ?? t.task_type}</p>
        <Badge variant="outline" className={cn("text-[10px] uppercase", STATUS_VARIANT[t.status])}>{t.status}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {opts.incoming ? "From" : "To"}{" "}
        {opts.incoming ? "another user" : "another user"} · {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
      </p>
      {t.due_at && (
        <p className="mt-1 text-xs text-muted-foreground">
          Due {format(new Date(t.due_at), "PPP")}
        </p>
      )}
    </button>
  );

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Tasks &amp; Notifications</h1>
          <p className="text-sm text-muted-foreground">Pending actions and recent activity</p>
        </div>

        <Tabs defaultValue="pending">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">
              <Inbox className="mr-1 h-4 w-4" /> Action ({pendingForMe.length})
            </TabsTrigger>
            <TabsTrigger value="mine">
              <History className="mr-1 h-4 w-4" /> Sent
            </TabsTrigger>
            <TabsTrigger value="activity">
              <AlertCircle className="mr-1 h-4 w-4" /> Activity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-2">
            {loading ? (
              <Skeleton className="h-20" />
            ) : pendingForMe.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">All caught up</CardContent></Card>
            ) : (
              pendingForMe.map((t) => renderTaskRow(t, { incoming: true }))
            )}
          </TabsContent>

          <TabsContent value="mine" className="space-y-2">
            {mineInitiated.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No requests sent yet</CardContent></Card>
            ) : (
              mineInitiated.map((t) => renderTaskRow(t, { incoming: false }))
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-2">
            {notifications.length === 0 ? (
              <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No activity yet</CardContent></Card>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read_at && markRead([n.id])}
                  className={cn(
                    "block w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40",
                    !n.read_at && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{n.title}</p>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                </button>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail panel */}
      <div>
        {selected ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{TYPE_LABEL[selected.task_type] ?? selected.task_type}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}
                    {selected.due_at && ` · due ${format(new Date(selected.due_at), "PPP")}`}
                  </p>
                </div>
                <Badge variant="outline" className={cn("text-[10px] uppercase", STATUS_VARIANT[selected.status])}>
                  {selected.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Payload preview */}
              {selected.payload && Object.keys(selected.payload).length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Details</p>
                  <dl className="space-y-1 text-sm">
                    {Object.entries(selected.payload).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{k.replace(/_/g, " ")}</dt>
                        <dd className="text-right font-medium">
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Actions */}
              {selected.status === "pending" && isMyTask(selected) && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      // For client-side property link requests, open the property selector dialog
                      if (selected.task_type === "link_request" && isClient && !isProvider) {
                        setLinkApproveTaskId(selected.id);
                        setLinkApproveTenant(
                          selected.payload?.provider_name ?? null
                        );
                      } else {
                        setActionDialog("approve");
                      }
                    }}
                    className="flex-1"
                  >
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setActionDialog("reject")} className="flex-1">
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
              {selected.status === "pending" && selected.initiator_user_id === user?.id && (
                <Button variant="outline" className="w-full" onClick={async () => {
                  await actOnTask(selected.id, "cancel");
                  toast.success("Request cancelled");
                  setSelected(null);
                  reload();
                }}>
                  Cancel request
                </Button>
              )}

              {/* Comments */}
              {comments.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Comments</p>
                  <ul className="space-y-2">
                    {comments.map((c) => (
                      <li key={c.id} className="rounded-lg border bg-card p-2 text-sm">
                        <p>{c.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Audit timeline */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Audit trail</p>
                <ol className="space-y-1 border-l border-border pl-4 text-sm">
                  {events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[18px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <span className="font-medium capitalize">{e.event_type.replace(/_/g, " ")}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="py-20 text-center text-sm text-muted-foreground">
            Select a task to view details
          </CardContent></Card>
        )}
      </div>

      {/* Action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog === "approve" ? "Approve task" : "Reject task"}</DialogTitle>
            <DialogDescription>
              {actionDialog === "approve"
                ? "Add an optional comment for the requester."
                : "Please explain why you're rejecting this request."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={actionDialog === "reject" ? "Reason for rejection (required)" : "Optional comment"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={submitting || (actionDialog === "reject" && !comment.trim())}
              variant={actionDialog === "reject" ? "destructive" : "default"}
            >
              {submitting ? "Submitting…" : actionDialog === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApproveLinkDialog
        taskId={linkApproveTaskId}
        tenantName={linkApproveTenant}
        onClose={() => {
          setLinkApproveTaskId(null);
          setLinkApproveTenant(null);
        }}
        onDone={() => {
          setSelected(null);
          reload();
        }}
      />
    </div>
  );
}