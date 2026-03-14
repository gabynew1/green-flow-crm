import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "inspection" | "offer" | "contract";
}

export default function CreatePipelineItemDialog({ open, onOpenChange, type }: Props) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    const [custRes, propRes] = await Promise.all([
      supabase.from("customers").select("id, name, email, company_name").order("name"),
      supabase.from("properties").select("id, name, customer_id").order("name"),
    ]);
    setCustomers(custRes.data ?? []);
    setProperties(propRes.data ?? []);
  };

  const filteredProperties = properties.filter(p => p.customer_id === selectedCustomerId);

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPropertyId("");
    setName("");
    setNotes("");
  };

  const handleCreate = async () => {
    if (!selectedPropertyId || !selectedCustomerId || !name.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      if (type === "offer") {
        const { data, error } = await supabase.from("offers").insert({
          offer_name: name.trim(),
          property_id: selectedPropertyId,
          customer_id: selectedCustomerId,
          tenant_id: profile?.tenant_id,
          notes: notes.trim() || null,
          created_by: user!.id,
          status: "DRAFT",
        }).select().single();
        if (error) throw error;
        toast.success("Offer created!");
        resetForm();
        onOpenChange(false);
        navigate(`/provider/offers/${data.id}`);
      } else {
        const { data, error } = await supabase.from("contracts").insert({
          contract_name: name.trim(),
          property_id: selectedPropertyId,
          start_date: new Date().toISOString().split("T")[0],
          status: "DRAFT",
        } as any).select().single();
        if (error) throw error;
        toast.success("Contract created!");
        resetForm();
        onOpenChange(false);
        navigate(`/provider/contracts/${data.id}`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const label = type === "offer" ? "Offer" : "Contract";

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create {label}</DialogTitle>
          <DialogDescription>Create a draft {label.toLowerCase()} for an existing customer & property</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Select value={selectedCustomerId} onValueChange={(v) => { setSelectedCustomerId(v); setSelectedPropertyId(""); }}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.company_name ? ` (${c.company_name})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedCustomerId && (
            <div className="space-y-2">
              <Label>Property *</Label>
              <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>
                  {filteredProperties.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {filteredProperties.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No properties for this customer</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>{label} Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${type === "offer" ? "Garden Maintenance Offer" : "Annual Service Contract"}`} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : `Create ${label}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}