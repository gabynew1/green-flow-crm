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
import { Plus, Search, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  IN_PROGRESS: "secondary",
  SENT_TO_CLIENT: "outline",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "destructive",
  CANCELED: "destructive",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In Progress",
  SENT_TO_CLIENT: "Sent to Client",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELED: "Canceled",
};

export default function Offers({ embedded }: { embedded?: boolean } = {}) {
  const { user, profile } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [offRes, propRes] = await Promise.all([
      supabase
        .from("offers")
        .select("*, properties(name, customers(name))")
        .order("created_at", { ascending: false }),
      supabase.from("properties").select("id, name, customer_id, customers(id, name)").order("name"),
    ]);
    setOffers(offRes.data ?? []);
    setProperties(propRes.data ?? []);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const propertyId = form.get("property_id") as string;
    const property = properties.find(p => p.id === propertyId);
    if (!property) { toast.error("Select a property"); return; }

    const { error } = await supabase.from("offers").insert({
      offer_name: form.get("offer_name") as string,
      property_id: propertyId,
      customer_id: (property.customers as any)?.id || property.customer_id,
      tenant_id: profile?.tenant_id,
      valid_until: (form.get("valid_until") as string) || null,
      notes: (form.get("notes") as string) || null,
      created_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Offer created!");
    setOpen(false);
    load();
  };

  const filtered = useMemo(() => {
    return offers.filter(o => {
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return o.offer_name?.toLowerCase().includes(q) ||
        (o.properties as any)?.name?.toLowerCase().includes(q) ||
        (o.properties as any)?.customers?.name?.toLowerCase().includes(q);
    });
  }, [offers, statusFilter, search]);

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Offers</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{offers.length} total</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Offer</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Offer</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Offer Name *</Label><Input name="offer_name" required placeholder="e.g. Garden Maintenance Package" /></div>
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
              <div className="space-y-2"><Label>Valid Until</Label><Input name="valid_until" type="date" /></div>
              <div className="space-y-2"><Label>Notes</Label><Input name="notes" placeholder="Optional notes…" /></div>
              <Button type="submit" className="w-full">Create Offer</Button>
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
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="SENT_TO_CLIENT">Sent to Client</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
            <SelectItem value="CANCELED">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.map(o => (
          <Link key={o.id} to={`/provider/offers/${o.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-4 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div>
                    <p className="font-medium">{o.offer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(o.properties as any)?.customers?.name} · {(o.properties as any)?.name}
                      {o.valid_until && ` · Valid until ${format(new Date(o.valid_until), "MMM d, yyyy")}`}
                    </p>
                    {o.total_value && <p className="text-xs font-medium mt-0.5">${Number(o.total_value).toFixed(2)}</p>}
                  </div>
                </div>
                <Badge variant={statusVariant[o.status] || "secondary"}>{statusLabels[o.status] || o.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">No offers found</p>}
      </div>
    </div>
  );
}
