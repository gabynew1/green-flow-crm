import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  COMPLETED: "default",
  OFFER_GENERATED: "outline",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  COMPLETED: "Completed",
  OFFER_GENERATED: "Offer Generated",
};

export default function Inspections({ embedded }: { embedded?: boolean } = {}) {
  const { user, profile } = useAuth();
  const [inspections, setInspections] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [insRes, propRes] = await Promise.all([
      supabase
        .from("inspections")
        .select("*, properties(name, customers(name))")
        .order("created_at", { ascending: false }),
      supabase.from("properties").select("id, name, customer_id, customers(id, name)").order("name"),
    ]);
    setInspections(insRes.data ?? []);
    setProperties(propRes.data ?? []);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const propertyId = form.get("property_id") as string;
    const property = properties.find(p => p.id === propertyId);
    if (!property) { toast.error("Select a property"); return; }

    const { error } = await supabase.from("inspections").insert({
      title: form.get("title") as string,
      property_id: propertyId,
      customer_id: (property.customers as any)?.id || property.customer_id,
      tenant_id: profile?.tenant_id,
      notes: (form.get("notes") as string) || null,
      created_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Inspection created!");
    setOpen(false);
    load();
  };

  const filtered = useMemo(() => {
    return inspections.filter(i => {
      if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return i.title?.toLowerCase().includes(q) ||
        (i.properties as any)?.name?.toLowerCase().includes(q) ||
        (i.properties as any)?.customers?.name?.toLowerCase().includes(q);
    });
  }, [inspections, statusFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inspections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{inspections.length} total</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Inspection</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Inspection</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Title *</Label><Input name="title" required placeholder="e.g. Initial Site Assessment" /></div>
              <div className="space-y-2">
                <Label>Property *</Label>
                <Select name="property_id" required>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {(p.customers as any)?.name} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Input name="notes" placeholder="Optional notes…" /></div>
              <Button type="submit" className="w-full">Create Inspection</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="OFFER_GENERATED">Offer Generated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map(i => (
          <Link key={i.id} to={`/provider/inspections/${i.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium">{i.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {(i.properties as any)?.customers?.name} · {(i.properties as any)?.name}
                      {i.inspected_date && ` · ${format(new Date(i.inspected_date), "MMM d, yyyy")}`}
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant[i.status] || "secondary"}>{statusLabels[i.status] || i.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">No inspections found</p>}
      </div>
    </div>
  );
}
