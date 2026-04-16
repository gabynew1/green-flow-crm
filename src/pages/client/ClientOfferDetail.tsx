import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Check, X, FileText, CalendarDays, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusLabels: Record<string, string> = {
  SENT_TO_CLIENT: "Pending Review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELED: "Canceled",
};

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  SENT_TO_CLIENT: "outline",
  ACCEPTED: "default",
  REJECTED: "destructive",
};

export default function ClientOfferDetail() {
  const { offerId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");

  useEffect(() => { if (user && offerId) load(); }, [user, offerId]);

  const load = async () => {
    setLoading(true);
    const [offerRes, liRes] = await Promise.all([
      supabase.from("offers").select("*, properties(name, address, city)").eq("id", offerId!).single(),
      supabase.from("offer_line_items").select("*, service_catalog(name, default_price)").eq("offer_id", offerId!),
    ]);
    setOffer(offerRes.data);
    setLineItems(liRes.data ?? []);
    setLoading(false);
  };

  const handleAccept = async () => {
    const { error } = await supabase.from("offers").update({ status: "ACCEPTED" } as any).eq("id", offerId!);
    if (error) { toast.error(error.message); return; }

    // Auto-generate draft contract
    const { data: contract, error: cErr } = await supabase.from("contracts").insert({
      contract_name: `Contract - ${offer.offer_name}`,
      property_id: offer.property_id,
      offer_id: offerId,
      start_date: new Date().toISOString().split("T")[0],
      status: "DRAFT",
      tenant_id: offer.tenant_id,
    } as any).select().single();

    if (!cErr && contract && lineItems.length > 0) {
      const contractLines = lineItems.map(li => ({
        contract_id: contract.id,
        service_catalog_id: li.service_catalog_id,
        custom_name: li.custom_name,
        quantity: li.quantity,
        unit: li.unit,
        notes: li.notes,
        tenant_id: offer.tenant_id,
      }));
      await supabase.from("contract_line_items").insert(contractLines);
    }

    // Notify provider
    if (offer) {
      const { data: offerFull } = await supabase.from("offers").select("tenant_id").eq("id", offerId!).single();
      if (offerFull?.tenant_id) {
        const { data: providerProfiles } = await supabase
          .from("profiles")
          .select("email")
          .eq("tenant_id", offerFull.tenant_id)
          .not("email", "is", null)
          .limit(1);
        const providerEmail = providerProfiles?.[0]?.email;
        if (providerEmail) {
          const { sendAppEmail } = await import("@/lib/send-app-email");
          sendAppEmail({
            templateName: "offer-response",
            recipientEmail: providerEmail,
            idempotencyKey: `offer-response-accepted-${offerId}`,
            templateData: {
              offerName: offer.offer_name,
              propertyName: offer.properties?.name,
              clientName: user?.user_metadata?.full_name || user?.email,
              response: "accepted",
            },
          });
        }
      }
    }

    toast.success("Offer accepted!");
    load();
  };

  const handleReject = async () => {
    const { error } = await supabase.from("offers").update({
      status: "REJECTED", rejection_comment: rejectComment.trim() || null,
    } as any).eq("id", offerId!);
    if (error) { toast.error(error.message); return; }

    // Notify provider
    if (offer) {
      const { data: offerFull } = await supabase.from("offers").select("tenant_id").eq("id", offerId!).single();
      if (offerFull?.tenant_id) {
        const { data: providerProfiles } = await supabase
          .from("profiles")
          .select("email")
          .eq("tenant_id", offerFull.tenant_id)
          .not("email", "is", null)
          .limit(1);
        const providerEmail = providerProfiles?.[0]?.email;
        if (providerEmail) {
          const { sendAppEmail } = await import("@/lib/send-app-email");
          sendAppEmail({
            templateName: "offer-response",
            recipientEmail: providerEmail,
            idempotencyKey: `offer-response-rejected-${offerId}`,
            templateData: {
              offerName: offer.offer_name,
              propertyName: offer.properties?.name,
              clientName: user?.user_metadata?.full_name || user?.email,
              response: "rejected",
              rejectionComment: rejectComment.trim() || undefined,
            },
          });
        }
      }
    }

    toast.success("Offer rejected");
    setRejectOpen(false);
    load();
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></div>;
  }
  if (!offer) return <p className="text-muted-foreground text-center py-12">Offer not found</p>;

  const totalValue = lineItems.reduce((sum, li) => {
    const price = li.unit_price || li.service_catalog?.default_price || 0;
    return sum + price * li.quantity;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/client/offers")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{offer.offer_name}</h1>
          <p className="text-sm text-muted-foreground">{offer.properties?.name}</p>
        </div>
        <Badge variant={statusColors[offer.status] || "secondary"} className="text-sm">
          {statusLabels[offer.status] || offer.status}
        </Badge>
      </div>

      {offer.status === "SENT_TO_CLIENT" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 flex items-center justify-between">
            <p className="text-sm font-medium">This offer is awaiting your decision. Review the details below.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAccept}><Check className="h-4 w-4 mr-1" /> Accept</Button>
              <Button size="sm" variant="destructive" onClick={() => { setRejectOpen(true); setRejectComment(""); }}>
                <X className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {offer.rejection_comment && offer.status === "REJECTED" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-destructive font-medium">Rejection reason:</p>
            <p className="text-sm text-muted-foreground mt-1 italic">"{offer.rejection_comment}"</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {offer.valid_until && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valid Until</span>
                <span className="font-medium">{format(new Date(offer.valid_until), "MMM d, yyyy")}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Property</span>
              <span className="font-medium">{offer.properties?.name}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" /> Pricing</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Value</span>
              <span className="font-medium text-lg">${totalValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Line Items</span>
              <span className="font-medium">{lineItems.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Services Included</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No line items</p>
          ) : (
            <div className="space-y-2">
              {lineItems.map(li => {
                const price = li.unit_price || li.service_catalog?.default_price || 0;
                return (
                  <div key={li.id} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md">
                    <div>
                      <p className="font-medium">{li.custom_name || li.service_catalog?.name || "Service"}</p>
                      <p className="text-xs text-muted-foreground">{li.quantity} {li.unit || "unit(s)"}</p>
                      {li.notes && <p className="text-xs text-muted-foreground mt-1 italic">{li.notes}</p>}
                    </div>
                    <span className="text-muted-foreground font-mono">${(price * li.quantity).toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {offer.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{offer.notes}</p></CardContent>
        </Card>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Offer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Provide a reason for rejecting this offer (optional).</p>
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
