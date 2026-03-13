import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  PAUSED: "outline",
  TERMINATED: "destructive",
};

const billingLabels: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ONE_TIME: "Ad hoc",
};

export default function Contracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [lineItemTotals, setLineItemTotals] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [billingCycle, setBillingCycle] = useState<"WEEKLY" | "MONTHLY" | "ONE_TIME">("MONTHLY");
  const [visitCount, setVisitCount] = useState(1);
  const [visitType, setVisitType] = useState("WEEK");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [contractRes, propRes, lineItemRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*, properties(name, customers(name))")
        .order("start_date", { ascending: false }),
      supabase.from("properties").select("id, name, address, customers(name)").order("name"),
      supabase
        .from("contract_line_items")
        .select("contract_id, quantity, service_catalog(default_price)")
    ]);
    setContracts(contractRes.data ?? []);
    setProperties(propRes.data ?? []);

    // Calculate total value per contract
    const totals = new Map<string, number>();
    for (const item of lineItemRes.data ?? []) {
      const price = (item.service_catalog as any)?.default_price ?? 0;
      const current = totals.get(item.contract_id) ?? 0;
      totals.set(item.contract_id, current + (item.quantity * price));
    }
    setLineItemTotals(totals);
  };

  const toggleProperty = (id: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const startDate = form.get("start_date") as string;
    const endDate = form.get("end_date") as string;
    const contractName = form.get("name") as string;

    if (selectedPropertyIds.length === 0) { toast.error("Select at least one property"); return; }
    if (!startDate || !endDate) { toast.error("Start and end dates are required"); return; }

    const inserts = selectedPropertyIds.map((propertyId) => ({
      contract_name: contractName,
      property_id: propertyId,
      start_date: startDate,
      end_date: endDate,
      billing_cycle: billingCycle,
      visit_frequency_count: visitCount,
      visit_frequency_type: visitType,
      status: "ACTIVE" as const,
    } as any));

    const { error } = await supabase.from("contracts").insert(inserts);
    if (error) { toast.error(error.message); return; }
    toast.success(`${inserts.length} contract(s) created!`);
    setOpen(false);
    setSelectedPropertyIds([]);
    setBillingCycle("MONTHLY");
    setVisitCount(1);
    setVisitType("WEEK");
    load();
  };

  const filtered = contracts.filter(c => {
    if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return c.contract_name.toLowerCase().includes(q) ||
      (c.properties as any)?.name?.toLowerCase().includes(q) ||
      (c.properties as any)?.customers?.name?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contracts</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedPropertyIds([]); setBillingCycle("MONTHLY"); } }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Contract</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Contract Name *</Label><Input name="name" required placeholder="e.g. Annual Maintenance 2026" /></div>
              <div className="space-y-2">
                <Label>Properties *</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  {properties.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No properties available.</p>
                  ) : (
                    properties.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`cprop-${p.id}`}
                          checked={selectedPropertyIds.includes(p.id)}
                          onCheckedChange={() => toggleProperty(p.id)}
                        />
                        <label htmlFor={`cprop-${p.id}`} className="text-sm cursor-pointer flex-1">
                          {(p.customers as any)?.name} — {p.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                {selectedPropertyIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedPropertyIds.length} selected</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Start Date *</Label><Input name="start_date" type="date" required /></div>
                <div className="space-y-2"><Label>End Date *</Label><Input name="end_date" type="date" required /></div>
              </div>
              <div className="space-y-2">
                <Label>Visit Frequency</Label>
                <div className="flex gap-2">
                  <Select value={String(visitCount)} onValueChange={(v) => setVisitCount(Number(v))}>
                    <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={visitType} onValueChange={setVisitType}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEK">per Week</SelectItem>
                      <SelectItem value="MONTH">per Month</SelectItem>
                      <SelectItem value="YEAR">per Year</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Billing Frequency</Label>
                <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="ONE_TIME">Ad hoc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create Contract</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by customer, property, or contract…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PAUSED">Paused</SelectItem>
            <SelectItem value="TERMINATED">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Property</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total Value</TableHead>
              <TableHead>Visit Frequency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const customerName = (c.properties as any)?.customers?.name || "—";
              const propertyName = (c.properties as any)?.name || "—";
              const totalValue = lineItemTotals.get(c.id);

              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{customerName}</TableCell>
                  <TableCell>{propertyName}</TableCell>
                  <TableCell>
                    <Link to={`/provider/contracts/${c.id}`} className="text-primary hover:underline">
                      {c.contract_name}
                    </Link>
                  </TableCell>
                  <TableCell>{format(new Date(c.start_date), "MMM d, yyyy")}</TableCell>
                  <TableCell>{c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[c.status] || "secondary"} className="text-[10px]">
                      {c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {totalValue != null ? `$${totalValue.toFixed(2)}` : "—"}
                  </TableCell>
                  <TableCell>{billingLabels[c.billing_cycle] || c.billing_cycle}</TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No contracts found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
