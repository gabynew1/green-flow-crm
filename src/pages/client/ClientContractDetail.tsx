import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, X, FileText, CalendarDays, DollarSign, ClipboardList } from "lucide-react";
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
  ACTIVE: "Active",
  PAUSED: "Paused",
  TERMINATED: "Terminated",
  DRAFT: "Draft",
};

const billingLabels: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ONE_TIME: "Ad hoc",
};

const MAX_REJECTION_WORDS = 100;

export default function ClientContractDetail() {
  const { contractId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contract, setContract] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  useEffect(() => {
    if (user && contractId) load();
  }, [user, contractId]);

  const load = async () => {
    setLoading(true);
    const [contractRes, itemsRes, visitsRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*, properties(name, address, city)")
        .eq("id", contractId!)
        .single(),
      supabase
        .from("contract_line_items")
        .select("*, service_catalog(name, code)")
        .eq("contract_id", contractId!),
      supabase
        .from("service_orders")
        .select("id, scheduled_date, status, period_label")
        .eq("contract_id", contractId!)
        .gte("scheduled_date", new Date().toISOString().split("T")[0])
        .order("scheduled_date")
        .limit(10),
    ]);
    setContract(contractRes.data);
    setLineItems(itemsRes.data ?? []);
    setUpcomingVisits(visitsRes.data ?? []);
    setLoading(false);
  };

  const handleApprove = async () => {
    const { error } = await supabase
      .from("contracts")
      .update({ status: "ACTIVE" as any })
      .eq("id", contractId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract approved!");
    load();
  };

  const handleReject = async () => {
    const wordCount = rejectComment.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_REJECTION_WORDS) {
      toast.error(`Comment must be ${MAX_REJECTION_WORDS} words or fewer`);
      return;
    }
    const { error } = await supabase
      .from("contracts")
      .update({ status: "REJECTED" as any, rejection_comment: rejectComment.trim() || null } as any)
      .eq("id", contractId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract rejected");
    setRejectOpen(false);
    load();
  };

  const wordCount = rejectComment.trim().split(/\s+/).filter(Boolean).length;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!contract) {
    return <p className="text-muted-foreground text-center py-12">Contract not found</p>;
  }

  const totalValue = lineItems.reduce((sum, li) => {
    const price = li.service_catalog?.default_price || 0;
    return sum + price * li.quantity;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/client/contracts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contract.contract_name}</h1>
          <p className="text-sm text-muted-foreground">{contract.properties?.name}</p>
        </div>
        <Badge variant={statusColors[contract.status] || "secondary"} className="text-sm">
          {statusLabels[contract.status] || contract.status}
        </Badge>
      </div>

      {/* Action banner for pending */}
      {contract.status === "PENDING_NEW" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <p className="text-sm font-medium">This contract is awaiting your approval. Review the details below.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleApprove}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setRejectOpen(true); setRejectComment(""); }}>
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contract.rejection_comment && contract.status === "REJECTED" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-destructive font-medium">Rejection reason:</p>
            <p className="text-sm text-muted-foreground mt-1 italic">"{contract.rejection_comment}"</p>
          </CardContent>
        </Card>
      )}

      {/* Contract details grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start Date</span>
              <span className="font-medium">{format(new Date(contract.start_date), "MMM d, yyyy")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End Date</span>
              <span className="font-medium">{contract.end_date ? format(new Date(contract.end_date), "MMM d, yyyy") : "Ongoing"}</span>
            </div>
            {contract.visit_frequency_count && contract.visit_frequency_type && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Visit Frequency</span>
                <span className="font-medium">{contract.visit_frequency_count}x / {contract.visit_frequency_type.toLowerCase()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Billing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Billing Cycle</span>
              <span className="font-medium">{billingLabels[contract.billing_cycle] || contract.billing_cycle}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium">{contract.properties?.name}</span>
            </div>
            {contract.properties?.address && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Address</span>
                <span className="font-medium text-right">{[contract.properties.address, contract.properties.city].filter(Boolean).join(", ")}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Services Included</span>
            {totalValue > 0 && <span className="text-sm font-normal text-muted-foreground">Est. total: ${totalValue.toFixed(2)}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No line items defined</p>
          ) : (
            <div className="space-y-2">
              {lineItems.map((li) => (
                <div key={li.id} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md">
                  <div>
                    <p className="font-medium">{li.custom_name || li.service_catalog?.name || "Service"}</p>
                    <p className="text-xs text-muted-foreground">
                      {li.quantity} {li.unit || "unit(s)"} · {li.frequency_type.replace(/_/g, " ").toLowerCase()}
                    </p>
                    {li.notes && <p className="text-xs text-muted-foreground mt-1 italic">{li.notes}</p>}
                  </div>
                  {li.service_catalog?.default_price && (
                    <span className="text-muted-foreground">${(li.service_catalog.default_price * li.quantity).toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Visits */}
      {upcomingVisits.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming Visits</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingVisits.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md">
                  <span className="font-medium">{v.period_label || v.scheduled_date}</span>
                  <Badge variant="outline" className="text-xs">{v.status.replace(/_/g, " ")}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Contract</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Provide a reason for rejecting this contract (optional, max {MAX_REJECTION_WORDS} words).</p>
            <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="Reason…" rows={4} />
            <p className={`text-xs ${wordCount > MAX_REJECTION_WORDS ? "text-destructive" : "text-muted-foreground"}`}>{wordCount} / {MAX_REJECTION_WORDS} words</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={wordCount > MAX_REJECTION_WORDS}>Confirm Rejection</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
