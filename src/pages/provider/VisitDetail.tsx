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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Save, CalendarIcon, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-info/10 text-info",
  COMPLETED: "bg-primary/10 text-primary",
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-success/10 text-success",
  SENT_TO_CLIENT: "bg-accent/10 text-accent",
  CANCELED: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SENT_TO_CLIENT: "Sent to Client",
  CANCELED: "Canceled",
};

const allStatuses = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "PENDING_APPROVAL", "APPROVED", "SENT_TO_CLIENT", "CANCELED"];

export default function VisitDetail() {
  const { visitId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [editScheduledDate, setEditScheduledDate] = useState<Date | undefined>();
  const [editPerformedDate, setEditPerformedDate] = useState<Date | undefined>();
  const [editPeriodLabel, setEditPeriodLabel] = useState("");
  const [editPeriodType, setEditPeriodType] = useState("");

  useEffect(() => { load(); }, [visitId]);

  const load = async () => {
    const { data: o } = await supabase
      .from("service_orders")
      .select("*, properties(name, customers(name)), contracts(contract_name)")
      .eq("id", visitId!)
      .single();
    setOrder(o);
    setNotes(o?.notes || "");
    if (o) {
      setEditScheduledDate(o.scheduled_date ? parseISO(o.scheduled_date) : undefined);
      setEditPerformedDate(o.performed_date ? parseISO(o.performed_date) : undefined);
      setEditPeriodLabel(o.period_label || "");
      setEditPeriodType(o.period_type || "WEEK");
    }

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

  const changeStatus = async (newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "COMPLETED" && !order.performed_date) {
      updates.performed_date = new Date().toISOString().split("T")[0];
    }
    await supabase.from("service_orders").update(updates).eq("id", visitId!);
    toast.success(`Status changed to ${statusLabels[newStatus] || newStatus}`);
    load();
  };

  const saveAll = async () => {
    const updates: any = {
      notes,
      scheduled_date: editScheduledDate ? format(editScheduledDate, "yyyy-MM-dd") : null,
      performed_date: editPerformedDate ? format(editPerformedDate, "yyyy-MM-dd") : null,
      period_label: editPeriodLabel || null,
      period_type: editPeriodType,
    };
    const { error } = await supabase.from("service_orders").update(updates).eq("id", visitId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Visit updated!");
    setEditing(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/provider/visits"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Service Visit</h1>
          <p className="text-sm text-muted-foreground">
            {(order.properties as any)?.name} · {(order.properties as any)?.customers?.name}
          </p>
        </div>
        {/* Status dropdown */}
        <Select value={order.status} onValueChange={changeStatus}>
          <SelectTrigger className={cn("w-[180px] font-medium", statusColor[order.status])}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allStatuses.map(s => (
              <SelectItem key={s} value={s}>
                <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs", statusColor[s])}>
                  {statusLabels[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Details</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
            <Pencil className="h-4 w-4 mr-1" /> {editing ? "Cancel" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editScheduledDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editScheduledDate ? format(editScheduledDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editScheduledDate} onSelect={setEditScheduledDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Performed Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editPerformedDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editPerformedDate ? format(editPerformedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editPerformedDate} onSelect={setEditPerformedDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Period Label</Label>
                <Input value={editPeriodLabel} onChange={e => setEditPeriodLabel(e.target.value)} placeholder="e.g. Week 12" />
              </div>
              <div className="space-y-2">
                <Label>Period Type</Label>
                <Select value={editPeriodType} onValueChange={setEditPeriodType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEK">Week</SelectItem>
                    <SelectItem value="MONTH">Month</SelectItem>
                    <SelectItem value="ONE_TIME">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(order.contracts as any)?.contract_name && (
                <div className="sm:col-span-2">
                  <Label>Contract</Label>
                  <p className="text-sm text-muted-foreground mt-1">{(order.contracts as any).contract_name}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-muted-foreground">Period:</span> {order.period_label} ({order.period_type})</div>
              <div><span className="text-muted-foreground">Scheduled:</span> {order.scheduled_date}</div>
              <div><span className="text-muted-foreground">Performed:</span> {order.performed_date || "—"}</div>
              {(order.contracts as any)?.contract_name && (
                <div><span className="text-muted-foreground">Contract:</span> {(order.contracts as any).contract_name}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Services</h2>
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
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <Card key={item.id}>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Checkbox
                checked={item.is_completed}
                onCheckedChange={() => toggleItem(item.id, item.is_completed)}
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
          />
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={saveAll}><Save className="h-4 w-4 mr-2" /> Save Changes</Button>
      </div>
    </div>
  );
}
