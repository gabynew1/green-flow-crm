import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Play, Pause, XCircle } from "lucide-react";
import { toast } from "sonner";
import { format, getISOWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

export default function ContractDetail() {
  const { contractId } = useParams();
  const { user } = useAuth();
  const [contract, setContract] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { load(); }, [contractId]);

  const load = async () => {
    const { data: c } = await supabase
      .from("contracts")
      .select("*, properties(id, name, customers(name))")
      .eq("id", contractId!)
      .single();
    setContract(c);

    const { data: li } = await supabase
      .from("contract_line_items")
      .select("*, service_catalog(name, code)")
      .eq("contract_id", contractId!)
      .order("created_at");
    setLineItems(li ?? []);

    const { data: cat } = await supabase.from("service_catalog").select("*").eq("is_active", true).order("name");
    setCatalog(cat ?? []);
  };

  const updateStatus = async (status: string) => {
    await supabase.from("contracts").update({ status }).eq("id", contractId!);
    toast.success(`Contract ${status.toLowerCase()}`);
    load();
  };

  const handleAddLine = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("contract_line_items").insert({
      contract_id: contractId!,
      service_catalog_id: form.get("service_id") as string,
      custom_name: (form.get("custom_name") as string) || null,
      frequency_type: form.get("frequency") as string,
      quantity: Number(form.get("quantity")) || 1,
      unit: form.get("unit") as string,
      notes: (form.get("notes") as string) || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Line item added!");
    setAddOpen(false);
    load();
  };

  const generateVisit = async () => {
    if (!contract || lineItems.length === 0) { toast.error("No line items to generate from"); return; }
    const now = new Date();
    const periodLabel = contract.billing_cycle === "WEEKLY"
      ? `${format(now, "yyyy")}-W${String(getISOWeek(now)).padStart(2, "0")}`
      : format(now, "yyyy-MM");
    const periodType = contract.billing_cycle === "WEEKLY" ? "WEEK" : contract.billing_cycle === "ONE_TIME" ? "ONE_TIME" : "MONTH";

    const { data: so, error } = await supabase.from("service_orders").insert({
      property_id: (contract.properties as any).id,
      contract_id: contractId!,
      scheduled_date: format(now, "yyyy-MM-dd"),
      period_type: periodType,
      period_label: periodLabel,
      status: "DRAFT",
      created_by_user_id: user?.id,
    }).select().single();

    if (error) { toast.error(error.message); return; }

    const items = lineItems.map(li => ({
      service_order_id: so.id,
      contract_line_item_id: li.id,
      service_catalog_id: li.service_catalog_id,
      name: li.custom_name || (li.service_catalog as any)?.name || "Service",
      quantity: li.quantity,
      unit: li.unit,
      source: "CONTRACT" as const,
    }));

    await supabase.from("service_order_items").insert(items);
    toast.success("Service visit generated!");
  };

  if (!contract) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/contracts"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contract.contract_name}</h1>
          <p className="text-sm text-muted-foreground">
            {(contract.properties as any)?.customers?.name} · {(contract.properties as any)?.name}
          </p>
        </div>
        <Badge variant="secondary">{contract.status}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 text-sm">
          <div><span className="text-muted-foreground">Period:</span> {contract.start_date} → {contract.end_date || "Ongoing"}</div>
          <div><span className="text-muted-foreground">Billing:</span> {contract.billing_cycle}</div>
          <div className="flex gap-2 ml-auto">
            {contract.status === "DRAFT" && <Button size="sm" onClick={() => updateStatus("ACTIVE")}><Play className="h-3 w-3 mr-1" /> Activate</Button>}
            {contract.status === "ACTIVE" && <Button size="sm" variant="secondary" onClick={() => updateStatus("PAUSED")}><Pause className="h-3 w-3 mr-1" /> Pause</Button>}
            {(contract.status === "ACTIVE" || contract.status === "PAUSED") && (
              <Button size="sm" variant="destructive" onClick={() => updateStatus("TERMINATED")}><XCircle className="h-3 w-3 mr-1" /> Terminate</Button>
            )}
            {contract.status === "ACTIVE" && (
              <Button size="sm" onClick={generateVisit}>Generate Visit</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Line Items</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Line</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
            <form onSubmit={handleAddLine} className="space-y-4">
              <div className="space-y-2">
                <Label>Service *</Label>
                <Select name="service_id" required>
                  <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                  <SelectContent>
                    {catalog.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Custom Name (optional)</Label><Input name="custom_name" /></div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select name="frequency" defaultValue="PER_VISIT">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PER_VISIT">Per Visit</SelectItem>
                    <SelectItem value="PER_WEEK">Per Week</SelectItem>
                    <SelectItem value="PER_MONTH">Per Month</SelectItem>
                    <SelectItem value="ONE_TIME">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Quantity</Label><Input name="quantity" type="number" defaultValue="1" /></div>
                <div className="space-y-2"><Label>Unit</Label><Input name="unit" defaultValue="visit" /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Input name="notes" /></div>
              <Button type="submit" className="w-full">Add</Button>
            </form>
          </DialogContent>
        </Dialog>
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
                <TableHead>Unit</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map(li => (
                <TableRow key={li.id}>
                  <TableCell className="font-medium">{li.custom_name || (li.service_catalog as any)?.name}</TableCell>
                  <TableCell>{li.frequency_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>{li.quantity}</TableCell>
                  <TableCell>{li.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{li.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
