import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "inspection" | "offer" | "contract";
  defaultCustomerId?: string;
  onCreated?: () => void;
}

export default function CreatePipelineItemDialog({ open, onOpenChange, type, defaultCustomerId, onCreated }: Props) {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");

  // Contract-specific state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [billingCycle, setBillingCycle] = useState<"WEEKLY" | "MONTHLY" | "ONE_TIME">("MONTHLY");
  const [visitCount, setVisitCount] = useState(1);
  const [visitType, setVisitType] = useState("WEEK");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
      if (defaultCustomerId) setSelectedCustomerId(defaultCustomerId);
    }
  }, [open, defaultCustomerId]);

  const loadData = async () => {
    const [custRes, propRes] = await Promise.all([
      supabase.from("customers").select("id, name, email, company_name").order("name"),
      supabase.from("properties").select("id, name, customer_id").order("name"),
    ]);
    setCustomers(custRes.data ?? []);
    setProperties(propRes.data ?? []);

    if (type === "contract") {
      const svcRes = await supabase.from("service_catalog").select("*").eq("is_active", true).order("code").order("name");
      setServices(svcRes.data ?? []);
    }
  };

  const filteredProperties = properties.filter(p => p.customer_id === selectedCustomerId);
  const categories = [...new Set(services.map((s) => s.code as string))].sort();
  const filteredServices = services.filter((s) => s.code === selectedCategory);

  const toggleProperty = (id: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPropertyId("");
    setSelectedPropertyIds([]);
    setName("");
    setNotes("");
    setStartDate("");
    setEndDate("");
    setBillingCycle("MONTHLY");
    setVisitCount(1);
    setVisitType("WEEK");
    setSelectedCategory("");
    setSelectedServiceIds([]);
  };

  const handleCreate = async () => {
    if (!selectedCustomerId || !name.trim()) {
      toast.error("Fill in all required fields");
      return;
    }

    if (type === "contract") {
      if (selectedPropertyIds.length === 0) { toast.error("Select at least one property"); return; }
      if (!startDate || !endDate) { toast.error("Start and end dates are required"); return; }
      if (selectedServiceIds.length === 0) { toast.error("Select at least one service"); return; }
    } else {
      if (!selectedPropertyId) { toast.error("Select a property"); return; }
    }

    setSaving(true);
    try {
      if (type === "inspection") {
        const { data, error } = await supabase.from("inspections").insert({
          title: name.trim(),
          property_id: selectedPropertyId,
          customer_id: selectedCustomerId,
          tenant_id: profile?.tenant_id,
          notes: notes.trim() || null,
          created_by: user!.id,
          status: "SCHEDULED",
        }).select().single();
        if (error) throw error;
        toast.success("Inspection created!");
        resetForm();
        onOpenChange(false);
        navigate(`/provider/inspections/${data.id}`);
      } else if (type === "offer") {
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
        // Contract: create one per selected property
        const inserts = selectedPropertyIds.map((propertyId) => ({
          contract_name: name.trim(),
          property_id: propertyId,
          start_date: startDate,
          end_date: endDate,
          billing_cycle: billingCycle,
          visit_frequency_count: visitCount,
          visit_frequency_type: visitType,
          status: "DRAFT" as const,
        } as any));

        const { data: created, error } = await supabase.from("contracts").insert(inserts).select("id");
        if (error) throw error;

        // Insert contract line items
        const lineItems = (created ?? []).flatMap((contract) =>
          selectedServiceIds.map((serviceId) => ({
            contract_id: contract.id,
            service_catalog_id: serviceId,
            quantity: 1,
            frequency_type: "PER_VISIT" as const,
          }))
        );
        if (lineItems.length > 0) {
          const { error: liError } = await supabase.from("contract_line_items").insert(lineItems);
          if (liError) toast.error("Contract created but failed to add service lines: " + liError.message);
        }

        toast.success(`${inserts.length} contract(s) created!`);
        resetForm();
        onOpenChange(false);
        onCreated?.();
        if (created && created.length === 1) {
          navigate(`/provider/contracts/${created[0].id}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const label = type === "inspection" ? "Inspection" : type === "offer" ? "Offer" : "Contract";
  const isContract = type === "contract";

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className={isContract ? "sm:max-w-lg max-h-[90vh] overflow-y-auto" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>Create {label}</DialogTitle>
          <DialogDescription>Create a draft {label.toLowerCase()} for an existing customer & property</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Select value={selectedCustomerId} onValueChange={(v) => { setSelectedCustomerId(v); setSelectedPropertyId(""); setSelectedPropertyIds([]); }}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.company_name ? ` (${c.company_name})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCustomerId && !isContract && (
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

          {selectedCustomerId && isContract && (
            <div className="space-y-2">
              <Label>Properties * (select one or more)</Label>
              <div className="border rounded-md p-3 space-y-2 max-h-36 overflow-y-auto">
                {filteredProperties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No properties for this customer</p>
                ) : (
                  filteredProperties.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`pprop-${p.id}`}
                        checked={selectedPropertyIds.includes(p.id)}
                        onCheckedChange={() => toggleProperty(p.id)}
                      />
                      <label htmlFor={`pprop-${p.id}`} className="text-sm cursor-pointer flex-1">{p.name}</label>
                    </div>
                  ))
                )}
              </div>
              {selectedPropertyIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{selectedPropertyIds.length} selected</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>{label} Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${type === "inspection" ? "Spring Garden Inspection" : type === "offer" ? "Garden Maintenance Offer" : "Annual Service Contract"}`} />
          </div>

          {isContract && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
              </div>

              {/* Service Selection */}
              <div className="space-y-2">
                <Label>Services *</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCategory && filteredServices.length > 0 && (
                  <div className="border rounded-md p-3 space-y-2 max-h-36 overflow-y-auto">
                    {filteredServices.map((svc) => (
                      <div key={svc.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`psvc-${svc.id}`}
                          checked={selectedServiceIds.includes(svc.id)}
                          onCheckedChange={() => toggleService(svc.id)}
                        />
                        <label htmlFor={`psvc-${svc.id}`} className="text-sm cursor-pointer flex-1">{svc.name}</label>
                      </div>
                    ))}
                  </div>
                )}
                {selectedServiceIds.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{selectedServiceIds.length} service(s) selected:</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedServiceIds.map((id) => {
                        const svc = services.find((s) => s.id === id);
                        return svc ? (
                          <Badge key={id} variant="secondary" className="text-xs gap-1">
                            {svc.name}
                            <button type="button" onClick={() => toggleService(id)} className="hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}
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
            </>
          )}

          {!isContract && (
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
            </div>
          )}

          <Button className="w-full" onClick={handleCreate} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : `Create ${label}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}