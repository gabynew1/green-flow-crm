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
import { ArrowLeft, Plus, Send, FileText, XCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

const statusLabels: Record<string, string> = {
  DRAFT: "Draft", IN_PROGRESS: "In Progress", SENT_TO_CLIENT: "Sent to Client",
  ACCEPTED: "Accepted", REJECTED: "Rejected", EXPIRED: "Expired", CANCELED: "Canceled",
};

export default function OfferDetail() {
  const { offerId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [offer, setOffer] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);

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

  const updateStatus = async (status: string) => {
    await supabase.from("offers").update({ status } as any).eq("id", offerId!);
    toast.success(`Offer ${statusLabels[status]?.toLowerCase() || status}`);
    load();
  };

  const updateTotal = async (items: any[]) => {
    const total = items.reduce((s, li) => s + (li.quantity * (li.unit_price || (li.service_catalog as any)?.default_price || 0)), 0);
    await supabase.from("offers").update({ total_value: total }).eq("id", offerId!);
  };

  const handleAddLine = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const serviceId = form.get("service_id") as string;
    const svc = catalog.find(c => c.id === serviceId);
    const { error } = await supabase.from("offer_line_items").insert({
      offer_id: offerId!,
      service_catalog_id: serviceId || null,
      custom_name: (form.get("custom_name") as string) || null,
      quantity: Number(form.get("quantity")) || 1,
      unit_price: Number(form.get("unit_price")) || svc?.default_price || null,
      unit: (form.get("unit") as string) || svc?.default_unit || null,
      notes: (form.get("notes") as string) || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Line item added!");
    setAddOpen(false);
    const { data: updated } = await supabase.from("offer_line_items").select("*, service_catalog(name, code, default_price)").eq("offer_id", offerId!);
    setLineItems(updated ?? []);
    await updateTotal(updated ?? []);
    load();
  };

  const deleteLine = async (id: string) => {
    await supabase.from("offer_line_items").delete().eq("id", id);
    const remaining = lineItems.filter(li => li.id !== id);
    setLineItems(remaining);
    await updateTotal(remaining);
    load();
  };

  const generateContract = async () => {
    if (!offer) return;
    const { data: contract, error } = await supabase.from("contracts").insert({
      contract_name: `Contract - ${offer.offer_name}`,
      property_id: offer.property_id,
      offer_id: offerId,
      start_date: new Date().toISOString().split("T")[0],
      status: "DRAFT",
    } as any).select().single();

    if (error) { toast.error(error.message); return; }

    // Copy offer line items to contract line items
    if (lineItems.length > 0) {
      const contractLines = lineItems.map(li => ({
        contract_id: contract.id,
        service_catalog_id: li.service_catalog_id,
        custom_name: li.custom_name,
        quantity: li.quantity,
        unit: li.unit,
        notes: li.notes,
      }));
      await supabase.from("contract_line_items").insert(contractLines);
    }

    toast.success("Contract generated from offer!");
    navigate(`/provider/contracts/${contract.id}`);
  };

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
            {offer.status === "ACCEPTED" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm"><FileText className="h-3 w-3 mr-1" /> Generate Contract</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Generate contract from this offer?</AlertDialogTitle>
                    <AlertDialogDescription>A new contract will be created with the offer's line items.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={generateContract}>Generate</AlertDialogAction>
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
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Line</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
              <form onSubmit={handleAddLine} className="space-y-4">
                <div className="space-y-2">
                  <Label>Service</Label>
                  <Select name="service_id">
                    <SelectTrigger><SelectValue placeholder="Select from catalog (optional)" /></SelectTrigger>
                    <SelectContent>
                      {catalog.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — ${s.default_price || 0}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Custom Name</Label><Input name="custom_name" placeholder="Override service name" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Qty</Label><Input name="quantity" type="number" defaultValue="1" /></div>
                  <div className="space-y-2"><Label>Unit Price</Label><Input name="unit_price" type="number" step="0.01" placeholder="Auto" /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input name="unit" defaultValue="visit" /></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Input name="notes" /></div>
                <Button type="submit" className="w-full">Add</Button>
              </form>
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
                <TableHead>Qty</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Subtotal</TableHead>
                <TableHead>Notes</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map(li => {
                const price = li.unit_price || (li.service_catalog as any)?.default_price || 0;
                return (
                  <TableRow key={li.id}>
                    <TableCell className="font-medium">{li.custom_name || (li.service_catalog as any)?.name || "—"}</TableCell>
                    <TableCell>{li.quantity} {li.unit}</TableCell>
                    <TableCell>${Number(price).toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${(li.quantity * price).toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{li.notes || "—"}</TableCell>
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
