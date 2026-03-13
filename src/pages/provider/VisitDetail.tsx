import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Send, Save } from "lucide-react";
import { toast } from "sonner";

export default function VisitDetail() {
  const { visitId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { load(); }, [visitId]);

  const load = async () => {
    const { data: o } = await supabase
      .from("service_orders")
      .select("*, properties(name, customers(name)), contracts(contract_name)")
      .eq("id", visitId!)
      .single();
    setOrder(o);
    setNotes(o?.notes || "");

    const { data: itms } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", visitId!)
      .order("source", { ascending: false });
    setItems(itms ?? []);

    const { data: cat } = await supabase.from("service_catalog").select("*").eq("is_active", true);
    setCatalog(cat ?? []);
  };

  const toggleItem = async (itemId: string, current: boolean) => {
    await supabase.from("service_order_items").update({ is_completed: !current }).eq("id", itemId);
    load();
  };

  const saveDraft = async () => {
    await supabase.from("service_orders").update({ notes, performed_date: new Date().toISOString().split("T")[0] }).eq("id", visitId!);
    toast.success("Draft saved!");
  };

  const sendToClient = async () => {
    await supabase.from("service_orders").update({ status: "SENT_TO_CLIENT", notes }).eq("id", visitId!);
    toast.success("Sent to client for review!");
    load();
  };

  const handleAddAdHoc = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const serviceId = form.get("service_id") as string;
    const svc = catalog.find(c => c.id === serviceId);
    const { error } = await supabase.from("service_order_items").insert({
      service_order_id: visitId!,
      service_catalog_id: serviceId || null,
      name: (form.get("name") as string) || svc?.name || "Custom service",
      quantity: Number(form.get("quantity")) || 1,
      unit: (form.get("unit") as string) || svc?.default_unit || "visit",
      source: "AD_HOC",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Ad-hoc item added!");
    setAddOpen(false);
    load();
  };

  if (!order) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SENT_TO_CLIENT: "bg-warning/10 text-warning",
    CLIENT_APPROVED: "bg-success/10 text-success",
    CLIENT_REJECTED: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/visits"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Service Visit</h1>
          <p className="text-sm text-muted-foreground">
            {(order.properties as any)?.name} · {(order.properties as any)?.customers?.name}
          </p>
        </div>
        <Badge className={statusColor[order.status]} variant="secondary">{order.status.replace(/_/g, " ")}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 text-sm">
          <div><span className="text-muted-foreground">Period:</span> {order.period_label} ({order.period_type})</div>
          <div><span className="text-muted-foreground">Scheduled:</span> {order.scheduled_date}</div>
          <div><span className="text-muted-foreground">Performed:</span> {order.performed_date || "—"}</div>
          {(order.contracts as any)?.contract_name && (
            <div><span className="text-muted-foreground">Contract:</span> {(order.contracts as any).contract_name}</div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Services</h2>
        {order.status === "DRAFT" && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Ad-hoc Service</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Ad-hoc Service</DialogTitle></DialogHeader>
              <form onSubmit={handleAddAdHoc} className="space-y-4">
                <div className="space-y-2">
                  <Label>From Catalog (optional)</Label>
                  <Select name="service_id">
                    <SelectTrigger><SelectValue placeholder="Select or leave blank" /></SelectTrigger>
                    <SelectContent>
                      {catalog.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Name</Label><Input name="name" placeholder="Custom name (overrides catalog)" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Qty</Label><Input name="quantity" type="number" defaultValue="1" /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input name="unit" defaultValue="visit" /></div>
                </div>
                <Button type="submit" className="w-full">Add</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={() => toggleItem(item.id, item.is_completed)}
                disabled={order.status !== "DRAFT"}
              />
              <div className="flex-1">
                <p className={`font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.quantity} {item.unit}</p>
              </div>
              <Badge variant="outline" className="text-xs">{item.source}</Badge>
            </CardContent>
          </Card>
        ))}
        {items.length === 0 && <p className="text-muted-foreground text-center py-4">No services in this visit</p>}
      </div>

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Visit Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes about this visit…"
            rows={4}
            disabled={order.status !== "DRAFT"}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      {order.status === "DRAFT" && (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={saveDraft}><Save className="h-4 w-4 mr-2" /> Save Draft</Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button><Send className="h-4 w-4 mr-2" /> Send to Client</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send to client for review?</AlertDialogTitle>
                <AlertDialogDescription>
                  The client will be able to review and approve or reject this service visit report.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={sendToClient}>Send</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
