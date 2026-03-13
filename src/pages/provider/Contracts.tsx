import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ACTIVE: "bg-success/10 text-success",
  PAUSED: "bg-warning/10 text-warning",
  TERMINATED: "bg-destructive/10 text-destructive",
};

export default function Contracts() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: c } = await supabase
      .from("contracts")
      .select("*, properties(name, customers(name))")
      .order("start_date", { ascending: false });
    setContracts(c ?? []);
    const { data: p } = await supabase.from("properties").select("id, name, customers(name)").order("name");
    setProperties(p ?? []);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("contracts").insert({
      property_id: form.get("property_id") as string,
      contract_name: form.get("name") as string,
      start_date: form.get("start_date") as string,
      end_date: (form.get("end_date") as string) || null,
      billing_cycle: form.get("billing_cycle") as string,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Contract created!");
    setOpen(false);
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Contract</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Contract Name *</Label><Input name="name" required /></div>
              <div className="space-y-2">
                <Label>Property *</Label>
                <Select name="property_id" required>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({(p.customers as any)?.name})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Start Date *</Label><Input name="start_date" type="date" required /></div>
                <div className="space-y-2"><Label>End Date</Label><Input name="end_date" type="date" /></div>
              </div>
              <div className="space-y-2">
                <Label>Billing Cycle</Label>
                <Select name="billing_cycle" defaultValue="MONTHLY">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="ONE_TIME">One-time</SelectItem>
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
          <Input placeholder="Search…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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

      <div className="space-y-3">
        {filtered.map(c => (
          <Link key={c.id} to={`/provider/contracts/${c.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.contract_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(c.properties as any)?.customers?.name} · {(c.properties as any)?.name} · {c.billing_cycle}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.start_date} → {c.end_date || "Ongoing"}</p>
                </div>
                <Badge className={statusColor[c.status]} variant="secondary">{c.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">No contracts found</p>}
      </div>
    </div>
  );
}
