import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Send, FileText, XCircle, Trash2, Check, Undo2, FilePlus2 } from "lucide-react";
import { toast } from "sonner";
import { WorkflowEngine } from "@/lib/workflow-engine";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

const statusLabels: Record<string, string> = {
  DRAFT: "Draft", IN_PROGRESS: "In Progress", SENT_TO_CLIENT: "Sent to Client",
  ACCEPTED: "Accepted", REJECTED: "Rejected", EXPIRED: "Expired", CANCELED: "Canceled",
};

export default function OfferDetail() {
  const { offerId } = useParams();
  const { user, profile } = useAuth();
  const currency = useTenantCurrency();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedServices, setSelectedServices] = useState<Record<string, { checked: boolean; frequency: string; visitCount: number }>>({});

  useEffect(() => { load(); }, [offerId]);

  const load = async () => {
    const [offerRes, liRes, catRes] = await Promise.all([
      supabase.from("offers").select("*, properties(id, name, customers(name)), inspections(title)").eq("id", offerId!).single(),
      supabase.from("offer_line_items").select("*, service_catalog(name, code, default_price)").eq("offer_id", offerId!).order("created_at"),
      supabase.from("service_catalog").select("*").eq("is_active", true).order("name"),
    ]);
    setOffer(offerRes.data);
    setLineItems(liRes.data ?? []);
    setCatalog(catRes.data ?? []);
  };

  const toggleService = (id: string, checked: boolean) => {
    setSelectedServices(prev => ({
      ...prev,
      [id]: { checked, frequency: prev[id]?.frequency || "PER_VISIT", visitCount: prev[id]?.visitCount || 1 },
    }));
  };

  const setServiceFrequency = (id: string, frequency: string) => {
    setSelectedServices(prev => ({
      ...prev,
      [id]: { ...prev[id], checked: true, frequency, visitCount: prev[id]?.visitCount || 1 },
    }));
  };

  const setServiceVisitCount = (id: string, visitCount: number) => {
    setSelectedServices(prev => ({
      ...prev,
      [id]: { ...prev[id], checked: true, visitCount },
    }));
  };

  const handleAddSelected = async () => {
    const toAdd = Object.entries(selectedServices)
      .filter(([, v]) => v.checked)
      .map(([id, v]) => {
        const svc = catalog.find(c => c.id === id);
        return {
          offer_id: offerId!,
          service_catalog_id: id,
          custom_name: null,
          quantity: 1,
          unit_price: svc?.default_price || null,
          unit: svc?.default_unit || null,
          notes: `${v.visitCount}x ${v.frequency.replace(/_/g, " ")}`,
        };
      });
    if (toAdd.length === 0) { toast.error("Select at least one service"); return; }
    const { error } = await supabase.from("offer_line_items").insert(toAdd);
    if (error) { toast.error(error.message); return; }
    toast.success(`${toAdd.length} line item(s) added!`);
    setAddOpen(false);
    setSelectedServices({});
    const { data: updated } = await supabase.from("offer_line_items").select("*, service_catalog(name, code, default_price)").eq("offer_id", offerId!);
    setLineItems(updated ?? []);
    await updateTotal(updated ?? []);
    load();
  };

  const updateStatus = async (status: any) => {
    try {
      await WorkflowEngine.transitionOffer(offerId!, status);
      toast.success(`Offer ${statusLabels[status]?.toLowerCase() || status}`);

      // Send email when offer is sent to client
      if (status === "SENT_TO_CLIENT" && offer) {
        const customerId = (offer.properties as any)?.customers?.id || offer.customer_id;
        if (customerId) {
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("customer_id", customerId)
            .maybeSingle();
          const { data: tenant } = offer.tenant_id
            ? await supabase.from("tenants").select("name").eq("id", offer.tenant_id).single()
            : { data: null };
          if (clientProfile?.email) {
            const { sendAppEmail } = await import("@/lib/send-app-email");
            sendAppEmail({
              templateName: "offer-sent",
              recipientEmail: clientProfile.email,
              idempotencyKey: `offer-sent-${offerId}`,
              templateData: {
                offerName: offer.offer_name,
                propertyName: (offer.properties as any)?.name,
                providerName: tenant?.name,
                totalValue: offer.total_value,
                validUntil: offer.valid_until,
              },
            });
          }
        }
      }

      load();
    } catch (e) {
      // Error handled by engine
    }
  };

  const updateTotal = async (items: any[]) => {
    const total = items.reduce((s, li) => s + (li.quantity * (li.unit_price || (li.service_catalog as any)?.default_price || 0)), 0);
    await supabase.from("offers").update({ total_value: total }).eq("id", offerId!);
  };

  const deleteLine = async (id: string) => {
    await supabase.from("offer_line_items").delete().eq("id", id);
    const remaining = lineItems.filter(li => li.id !== id);
    setLineItems(remaining);
    await updateTotal(remaining);
    load();
  };

  const acceptOnBehalf = async () => {
    try {
      const { contractId } = await WorkflowEngine.acceptOfferAndGenerateContract(offerId!, user!.id);
      toast.success("Offer accepted on behalf of client");
      toast.success("Contract generated from offer!");
      navigate(`/provider/contracts/${contractId}`);
    } catch (e) {
      // Error handled by engine
    }
  };

  const generateContractFromAccepted = async () => {
    try {
      const { contractId } = await WorkflowEngine.acceptOfferAndGenerateContract(offerId!, user!.id);
      toast.success("Contract generated from offer");
      navigate(`/provider/contracts/${contractId}`);
    } catch (e) {
      // Error handled by engine
    }
  };

  // generateContract logic moved to WorkflowEngine

  if (!offer) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const editable = offer.status === "DRAFT" || offer.status === "IN_PROGRESS";
  const total = lineItems.reduce((s, li) => s + (li.quantity * (li.unit_price || (li.service_catalog as any)?.default_price || 0)), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/offers"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{offer.offer_name}</h1>
          <p className="text-sm text-muted-foreground">
            {(offer.properties as any)?.customers?.name} · {(offer.properties as any)?.name}
            {(offer.inspections as any)?.title && ` · From: ${(offer.inspections as any).title}`}
          </p>
        </div>
        <Badge variant="secondary">{statusLabels[offer.status]}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 text-sm">
          {offer.valid_until && <div><span className="text-muted-foreground">Valid Until:</span> {offer.valid_until}</div>}
          <div><span className="text-muted-foreground">Total:</span> ${total.toFixed(2)}</div>
          {offer.rejection_comment && (
            <div className="w-full text-destructive text-xs italic">Rejection: "{offer.rejection_comment}"</div>
          )}
          <div className="flex gap-2 ml-auto">
            {offer.status === "DRAFT" && <Button size="sm" onClick={() => updateStatus("IN_PROGRESS")}>Start Working</Button>}
            {(offer.status === "DRAFT" || offer.status === "IN_PROGRESS") && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm"><Send className="h-3 w-3 mr-1" /> Send to Client</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send offer to client?</AlertDialogTitle>
                    <AlertDialogDescription>The client will be able to review, accept, or reject this offer.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => updateStatus("SENT_TO_CLIENT")}>Send</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {(offer.status === "SENT_TO_CLIENT" || offer.status === "ACCEPTED" || offer.status === "REJECTED") && (
              <Button size="sm" variant="ghost" onClick={() => updateStatus("IN_PROGRESS")}>
                <Undo2 className="h-3 w-3 mr-1" /> Revert to Edit
              </Button>
            )}
            {offer.status === "ACCEPTED" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm">
                    <FilePlus2 className="h-3 w-3 mr-1" /> Generate Contract
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Generate contract from this offer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A draft contract will be created with the offer's line items and opened for editing.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={generateContractFromAccepted}>Generate</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {offer.status === "SENT_TO_CLIENT" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline"><Check className="h-3 w-3 mr-1" /> Accept on Behalf</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Accept offer on behalf of client?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the offer as accepted on the client's behalf. The client will be informed that the offer was agreed offline.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={acceptOnBehalf}>Accept & Generate Contract</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {editable && (
              <Button size="sm" variant="destructive" onClick={() => updateStatus("CANCELED")}><XCircle className="h-3 w-3 mr-1" /> Cancel</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Line Items</h2>
        {editable && (
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setSelectedServices({}); }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Services</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Select Services</DialogTitle></DialogHeader>
              <ScrollArea className="max-h-[300px] border rounded-md p-3">
                <div className="space-y-3">
                  {catalog.map(s => (
                    <div key={s.id} className="flex items-center gap-3">
                      <Checkbox
                        id={`svc-${s.id}`}
                        checked={selectedServices[s.id]?.checked || false}
                        onCheckedChange={(checked) => toggleService(s.id, !!checked)}
                      />
                      <label htmlFor={`svc-${s.id}`} className="flex-1 text-sm cursor-pointer">
                        {s.name} {s.default_price ? `— ${formatCurrency(s.default_price, currency)}` : ""}
                      </label>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {Object.entries(selectedServices).filter(([, v]) => v.checked).length > 0 && (
                <div className="border rounded-md overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead>Visits</TableHead>
                        <TableHead>Frequency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(selectedServices)
                        .filter(([, v]) => v.checked)
                        .map(([id, v]) => {
                          const svc = catalog.find(c => c.id === id);
                          return (
                            <TableRow key={id}>
                              <TableCell className="font-medium text-sm">{svc?.name}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={1}
                                  value={v.visitCount}
                                  onChange={(e) => setServiceVisitCount(id, Number(e.target.value) || 1)}
                                  className="h-8 w-[70px]"
                                />
                              </TableCell>
                              <TableCell>
                                <Select value={v.frequency} onValueChange={(val) => setServiceFrequency(id, val)}>
                                  <SelectTrigger className="h-8 w-[140px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PER_VISIT">Per Visit</SelectItem>
                                    <SelectItem value="PER_WEEK">Per Week</SelectItem>
                                    <SelectItem value="PER_MONTH">Per Month</SelectItem>
                                    <SelectItem value="PER_YEAR">Per Year</SelectItem>
                                    <SelectItem value="ONE_TIME">One Time</SelectItem>
                                  </SelectContent>
                                </Select>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <Button onClick={handleAddSelected} className="w-full">
                Add {Object.values(selectedServices).filter(v => v.checked).length} Service(s)
              </Button>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {lineItems.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No line items yet</p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Subtotal</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map(li => {
                const price = li.unit_price || (li.service_catalog as any)?.default_price || 0;
                return (
                  <TableRow key={li.id}>
                    <TableCell className="font-medium">{li.custom_name || (li.service_catalog as any)?.name || "—"}</TableCell>
                    <TableCell>{li.notes ? li.notes.replace(/_/g, " ") : "—"}</TableCell>
                    <TableCell>{li.quantity} {li.unit}</TableCell>
                    <TableCell>${Number(price).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${(li.quantity * price).toFixed(2)}</TableCell>
                    {editable && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deleteLine(li.id)}><Trash2 className="h-3 w-3" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {offer.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{offer.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
