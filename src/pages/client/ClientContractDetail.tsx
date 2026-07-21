import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, CalendarDays, DollarSign, ClipboardList, Check, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { getContractConsumption, type LineItemConsumption } from "@/lib/contract-consumption";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT_TO_CLIENT: "outline",
  SIGNED: "default",
  ACTIVE: "default",
  CLOSED: "destructive",
  REJECTED: "destructive",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_CLIENT: "Pending Review",
  SIGNED: "Signed",
  ACTIVE: "Active",
  CLOSED: "Closed",
  REJECTED: "Rejected",
};

const billingLabels: Record<string, string> = {
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  ONE_TIME: "Ad hoc",
};

export default function ClientContractDetail() {
  const { contractId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contract, setContract] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]);
  const [consumption, setConsumption] = useState<LineItemConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  useEffect(() => { if (user && contractId) load(); }, [user, contractId]);

  const load = async () => {
    setLoading(true);
    const [contractRes, itemsRes, visitsRes] = await Promise.all([
      supabase.from("contracts").select("*, properties(name, address, city, tenant_id)").eq("id", contractId!).single(),
      supabase.from("contract_line_items").select("*, service_catalog(name, code, default_price)").eq("contract_id", contractId!),
      supabase.from("service_orders").select("id, scheduled_date, status, period_label").eq("contract_id", contractId!)
        .gte("scheduled_date", new Date().toISOString().split("T")[0]).order("scheduled_date").limit(10),
    ]);
    setContract(contractRes.data);
    setLineItems(itemsRes.data ?? []);
    setUpcomingVisits(visitsRes.data ?? []);
    // Load consumption for active/signed contracts
    if (contractRes.data && ["ACTIVE", "SIGNED"].includes(contractRes.data.status)) {
      const cons = await getContractConsumption(contractId!, contractRes.data.start_date, contractRes.data.end_date);
      setConsumption(cons);
    }
    setLoading(false);
  };

  const handleAccept = async () => {
    const { error } = await supabase.from("contracts").update({ status: "SIGNED" } as any).eq("id", contractId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract signed!");
    // Notify provider
    if (contract) {
      const { data: tenant } = await supabase.from("tenants").select("name").eq("id", contract.properties?.tenant_id).maybeSingle();
      const { data: providerProfiles } = await supabase
        .from("profiles")
        .select("email")
        .eq("tenant_id", contract.properties?.tenant_id)
        .not("email", "is", null)
        .limit(1);
      const providerEmail = providerProfiles?.[0]?.email;
      if (providerEmail) {
        const { sendAppEmail } = await import("@/lib/send-app-email");
        sendAppEmail({
          templateName: "contract-response",
          recipientEmail: providerEmail,
          idempotencyKey: `contract-response-signed-${contractId}`,
          tenantId: contract.properties?.tenant_id ?? null,
          templateData: {
            contractName: contract.contract_name,
            propertyName: contract.properties?.name,
            clientName: user?.user_metadata?.full_name || user?.email,
            response: "signed",
          },
        });
      }
    }
    load();
  };

  const handleReject = async () => {
    const { error } = await supabase.from("contracts").update({
      status: "REJECTED", rejection_comment: rejectComment.trim() || null,
    } as any).eq("id", contractId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract rejected");
    // Notify provider
    if (contract) {
      const { data: providerProfiles } = await supabase
        .from("profiles")
        .select("email")
        .eq("tenant_id", contract.properties?.tenant_id)
        .not("email", "is", null)
        .limit(1);
      const providerEmail = providerProfiles?.[0]?.email;
      if (providerEmail) {
        const { sendAppEmail } = await import("@/lib/send-app-email");
        sendAppEmail({
          templateName: "contract-response",
          recipientEmail: providerEmail,
          idempotencyKey: `contract-response-rejected-${contractId}`,
          tenantId: contract.properties?.tenant_id ?? null,
          templateData: {
            contractName: contract.contract_name,
            propertyName: contract.properties?.name,
            clientName: user?.user_metadata?.full_name || user?.email,
            response: "rejected",
            rejectionComment: rejectComment.trim() || undefined,
          },
        });
      }
    }
    setRejectOpen(false);
    load();
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (!contract) return <p className="text-muted-foreground text-center py-12">Contract not found</p>;

  const isIncluded = (li: any) =>
    li.is_included_in_base_fee === true ||
    (li.is_included_in_base_fee == null && li.unit_price == null && !(typeof li.custom_name === "string" && li.custom_name.startsWith("Flat fee")));
  const includedLines = lineItems.filter(isIncluded);
  const billedLines = lineItems.filter(li => !isIncluded(li));
  const billedTotal = billedLines.reduce((sum, li) => {
    const price = li.unit_price != null ? Number(li.unit_price) : (li.service_catalog?.default_price || 0);
    return sum + price * li.quantity;
  }, 0);
  const consumptionByLine = new Map(consumption.map(c => [c.lineItemId, c]));

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

      {contract.status === "SENT_TO_CLIENT" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <p className="text-sm font-medium">This contract is awaiting your decision. Review the details below.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAccept}><Check className="h-4 w-4 mr-1" /> Sign</Button>
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
          </CardContent>
        </Card>
      </div>

      {includedLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Included Allowances
              <span className="text-xs font-normal text-muted-foreground">covered by your subscription</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {includedLines.map(li => {
                const maxOcc = li.max_occurrences_per_period;
                const cons = consumptionByLine.get(li.id);
                return (
                  <div key={li.id} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md">
                    <div>
                      <p className="font-medium">{li.custom_name || li.service_catalog?.name || "Service"}</p>
                      <p className="text-xs text-muted-foreground">
                        {maxOcc != null
                          ? `Up to ${maxOcc} ${li.frequency_type.replace(/^PER_/, "").toLowerCase()}`
                          : "Unlimited"}
                        {li.unit_price != null && <span> · Overage {Number(li.unit_price).toFixed(2)}/unit</span>}
                      </p>
                    </div>
                    {maxOcc != null && cons && (
                      <Badge variant={cons.isOverScope ? "destructive" : "secondary"} className="text-[10px]">
                        {cons.consumed}/{maxOcc} {cons.periodLabel}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {billedLines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Additional Billable Services</span>
              {billedTotal > 0 && <span className="text-sm font-normal text-muted-foreground">Est. total: {billedTotal.toFixed(2)}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {billedLines.map(li => (
                <div key={li.id} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md">
                  <div>
                    <p className="font-medium">{li.custom_name || li.service_catalog?.name || "Service"}</p>
                    <p className="text-xs text-muted-foreground">
                      {li.quantity} × {li.frequency_type.replace(/_/g, " ").toLowerCase()}
                      {li.max_occurrences_per_period != null && <span className="ml-1">· max {li.max_occurrences_per_period}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    {li.unit_price != null ? (
                      <div>
                        <span className="font-medium">{(Number(li.unit_price) * Number(li.quantity)).toFixed(2)}</span>
                        {Number(li.quantity) > 1 && <p className="text-[10px] text-muted-foreground">{Number(li.unit_price).toFixed(2)} × {li.quantity}</p>}
                      </div>
                    ) : li.service_catalog?.default_price ? (
                      <span className="text-muted-foreground">{(li.service_catalog.default_price * li.quantity).toFixed(2)}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {lineItems.length === 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground text-center py-4">No line items defined</p>
          </CardContent>
        </Card>
      )}

      {/* Consumption Summary */}
      {["ACTIVE", "SIGNED"].includes(contract.status) && consumption.length > 0 && consumption.some(c => c.maxOccurrences !== null) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Service Usage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {consumption.filter(c => c.maxOccurrences !== null).map(c => {
              const pct = c.maxOccurrences! > 0 ? Math.min(100, (c.consumed / c.maxOccurrences!) * 100) : 0;
              return (
                <div key={c.lineItemId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.serviceName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{c.consumed}/{c.maxOccurrences} {c.periodLabel}</span>
                      <Badge
                        variant={c.isOverScope ? "destructive" : "default"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {c.isOverScope ? "Over Limit" : "In Scope"}
                      </Badge>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {upcomingVisits.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming Visits</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {upcomingVisits.map(v => (
                <div key={v.id} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md">
                  <span className="font-medium">{v.period_label || v.scheduled_date}</span>
                  <Badge variant="outline" className="text-xs">{v.status.replace(/_/g, " ")}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Contract</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Provide a reason for rejecting this contract (optional).</p>
            <Textarea value={rejectComment} onChange={e => setRejectComment(e.target.value)} placeholder="Reason…" rows={4} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject}>Confirm Rejection</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}