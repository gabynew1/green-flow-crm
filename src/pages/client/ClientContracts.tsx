import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING_NEW: "outline",
  ACTIVE: "default",
  PAUSED: "secondary",
  TERMINATED: "destructive",
  REJECTED: "destructive",
};

const statusLabels: Record<string, string> = {
  PENDING_NEW: "Pending Approval",
  REJECTED: "Rejected",
};

const billingLabels: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ONE_TIME: "Ad hoc",
};

const MAX_REJECTION_WORDS = 100;

export default function ClientContracts() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<any[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    const { data } = await supabase
      .from("contracts")
      .select("*, properties(name)")
      .order("created_at", { ascending: false });
    setContracts(data ?? []);
  };

  const handleApprove = async (contractId: string) => {
    const { error } = await supabase
      .from("contracts")
      .update({ status: "ACTIVE" as any })
      .eq("id", contractId);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract approved!");
    load();
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    const wordCount = rejectComment.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_REJECTION_WORDS) {
      toast.error(`Comment must be ${MAX_REJECTION_WORDS} words or fewer`);
      return;
    }
    const { error } = await supabase
      .from("contracts")
      .update({
        status: "REJECTED" as any,
        rejection_comment: rejectComment.trim() || null,
      } as any)
      .eq("id", rejectingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract rejected");
    setRejectingId(null);
    setRejectComment("");
    load();
  };

  const wordCount = rejectComment.trim().split(/\s+/).filter(Boolean).length;

  const pending = contracts.filter(c => c.status === "PENDING_NEW");
  const active = contracts.filter(c => c.status === "ACTIVE" || c.status === "PAUSED");
  const archived = contracts.filter(c => c.status === "REJECTED" || c.status === "TERMINATED");

  const renderContractCard = (c: any, showActions: boolean) => (
    <Card key={c.id} className="hover:border-primary/20 transition-colors">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">{c.contract_name}</p>
              <p className="text-sm text-muted-foreground">{(c.properties as any)?.name || "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(c.start_date), "MMM d, yyyy")} → {c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "Ongoing"}
              </p>
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                {c.visit_frequency_count && c.visit_frequency_type && (
                  <span>Visits: {c.visit_frequency_count}x / {c.visit_frequency_type.toLowerCase()}</span>
                )}
                <span>Billing: {billingLabels[c.billing_cycle] || c.billing_cycle}</span>
              </div>
              {c.rejection_comment && c.status === "REJECTED" && (
                <p className="text-xs text-destructive mt-2 italic">Your comment: "{c.rejection_comment}"</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={statusColors[c.status] || "secondary"} className="text-[10px]">
              {statusLabels[c.status] || c.status}
            </Badge>
            {showActions && c.status === "PENDING_NEW" && (
              <>
                <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => handleApprove(c.id)}>
                  <Check className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => { setRejectingId(c.id); setRejectComment(""); }}>
                  <X className="h-3 w-3 mr-1" /> Reject
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">My Contracts</h1>

      {/* Pending contracts */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Pending Approval
            <Badge variant="outline" className="text-xs">{pending.length}</Badge>
          </h2>
          {pending.map(c => renderContractCard(c, true))}
        </div>
      )}

      {/* Active contracts */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Active Contracts</h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No active contracts</p>
        ) : (
          active.map(c => renderContractCard(c, false))
        )}
      </div>

      {/* Archived */}
      {archived.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Archived</h2>
          {archived.map(c => renderContractCard(c, false))}
        </div>
      )}

      {contracts.length === 0 && (
        <p className="text-muted-foreground text-center py-12">No contracts yet</p>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(o) => { if (!o) setRejectingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this contract (optional, max {MAX_REJECTION_WORDS} words).</p>
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Reason for rejection…"
              rows={4}
            />
            <p className={`text-xs ${wordCount > MAX_REJECTION_WORDS ? "text-destructive" : "text-muted-foreground"}`}>
              {wordCount} / {MAX_REJECTION_WORDS} words
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={wordCount > MAX_REJECTION_WORDS}>
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
