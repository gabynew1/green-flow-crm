import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { CalendarPlus, X, Inbox, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import CreateAdHocVisitDialog from "@/components/provider/CreateAdHocVisitDialog";

type Row = any;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/40",
  converted: "bg-success/10 text-success border-success/40",
  declined: "bg-muted text-muted-foreground",
};

export default function VisitRequests() {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");

  const [declineTarget, setDeclineTarget] = useState<Row | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  const [convertTarget, setConvertTarget] = useState<Row | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { load(); }, [tenantId]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("visit_requests")
      .select("*, properties(name), customers(name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  };

  const visible = rows.filter((r) => (tab === "pending" ? r.status === "pending" : true));

  const handleDecline = async () => {
    if (!declineTarget) return;
    const { error } = await supabase
      .from("visit_requests")
      .update({ status: "declined", provider_note: declineNote || null })
      .eq("id", declineTarget.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Request declined");
    setDeclineTarget(null);
    setDeclineNote("");
    load();
  };

  const openConvert = (row: Row) => {
    setConvertTarget(row);
    setDialogOpen(true);
  };

  const onVisitCreated = async () => {
    if (!convertTarget) return;
    setConvertTarget(null);
    load();
  };

  const handleCreated = async (createdServiceOrderId?: string) => {
    if (!convertTarget) return;
    await supabase
      .from("visit_requests")
      .update({
        status: "converted",
        converted_service_order_id: createdServiceOrderId ?? null,
      })
      .eq("id", convertTarget.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Visit Requests
          </h1>
          <p className="text-sm text-muted-foreground">Client-submitted service requests awaiting your review.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "pending" ? "default" : "outline"} size="sm" onClick={() => setTab("pending")}>
            Pending ({rows.filter((r) => r.status === "pending").length})
          </Button>
          <Button variant={tab === "all" ? "default" : "outline"} size="sm" onClick={() => setTab("all")}>
            All
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Loading…</p>
      ) : visible.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">
          {tab === "pending" ? "No pending requests. All clear!" : "No requests yet."}
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{(r.properties as any)?.name || "Property"}</p>
                      <Badge variant="outline" className={STATUS_STYLES[r.status] || ""}>
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {(r.customers as any)?.name || "Client"}
                      {" · submitted "}{format(parseISO(r.created_at), "MMM d, yyyy")}
                      {r.preferred_date && ` · prefers ${r.preferred_date}`}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{r.description}</p>
                    {r.provider_note && (
                      <p className="text-xs text-muted-foreground mt-2 italic">Note: {r.provider_note}</p>
                    )}
                    {r.status === "converted" && r.converted_service_order_id && (
                      <Link
                        to={`/provider/visits/${r.converted_service_order_id}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> View scheduled visit
                      </Link>
                    )}
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => openConvert(r)} className="gap-1">
                        <CalendarPlus className="h-3.5 w-3.5" /> Convert
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeclineTarget(r)} className="gap-1">
                        <X className="h-3.5 w-3.5" /> Decline
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!declineTarget} onOpenChange={(v) => { if (!v) { setDeclineTarget(null); setDeclineNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this request</DialogTitle>
            <DialogDescription>Optionally add a note the client can see.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Note (optional)</Label>
            <Textarea value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeclineTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline}>Decline</Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateAdHocVisitDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setConvertTarget(null); }}
        onCreated={async (id) => {
          await handleCreated(id);
          await onVisitCreated();
        }}
        defaultCustomerId={convertTarget?.customer_id}
        defaultPropertyId={convertTarget?.property_id}
      />
    </div>
  );
}