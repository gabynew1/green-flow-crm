import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  defaultCustomerId?: string;
  defaultPropertyId?: string;
}

interface ContractWithItems {
  id: string;
  contract_name: string;
  status: string;
  serviceIds: string[];
}

interface Team {
  id: string;
  name: string;
  color: string;
}

const TIME_SLOTS = [
  { value: "08:00", label: "08:00 – 10:00" },
  { value: "10:00", label: "10:00 – 12:00" },
  { value: "12:00", label: "12:00 – 14:00" },
  { value: "14:00", label: "14:00 – 16:00" },
];

export default function CreateAdHocVisitDialog({ open, onOpenChange, onCreated, defaultCustomerId, defaultPropertyId }: Props) {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedSlot, setSelectedSlot] = useState("08:00");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [notes, setNotes] = useState("");

  // Contract-aware state
  const [propertyContracts, setPropertyContracts] = useState<ContractWithItems[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("ad_hoc");

  // Capacity check
  const [daySlotCount, setDaySlotCount] = useState(0);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  useEffect(() => {
    if (selectedPropertyId) {
      loadContracts(selectedPropertyId);
    } else {
      setPropertyContracts([]);
      setSelectedSource("ad_hoc");
    }
  }, [selectedPropertyId]);

  // Check capacity when date or team changes
  useEffect(() => {
    if (selectedDate && selectedTeamId) {
      checkCapacity();
    }
  }, [selectedDate, selectedTeamId]);

  const loadData = async () => {
    const [custRes, propRes, svcRes, teamRes] = await Promise.all([
      supabase.from("customers").select("id, name, company_name").order("name"),
      supabase.from("properties").select("id, name, customer_id").order("name"),
      supabase.from("service_catalog").select("id, name, code").eq("is_active", true).order("name"),
      tenantId ? supabase.from("teams").select("id, name, color").eq("tenant_id", tenantId).order("created_at") : Promise.resolve({ data: [] }),
    ]);
    const loadedCustomers = custRes.data ?? [];
    const loadedProperties = propRes.data ?? [];
    const loadedTeams = (teamRes.data ?? []) as Team[];
    setCustomers(loadedCustomers);
    setProperties(loadedProperties);
    setServices(svcRes.data ?? []);
    setTeams(loadedTeams);
    if (loadedTeams.length > 0 && !selectedTeamId) setSelectedTeamId(loadedTeams[0].id);

    if (defaultCustomerId && loadedCustomers.some((c: any) => c.id === defaultCustomerId)) {
      setSelectedCustomerId(defaultCustomerId);
      const custProps = loadedProperties.filter((p: any) => p.customer_id === defaultCustomerId);
      if (defaultPropertyId && custProps.some((p: any) => p.id === defaultPropertyId)) {
        setSelectedPropertyId(defaultPropertyId);
      } else if (custProps.length === 1) {
        setSelectedPropertyId(custProps[0].id);
      }
    }
  };

  const loadContracts = async (propertyId: string) => {
    const { data: contracts } = await supabase
      .from("contracts")
      .select("id, contract_name, status")
      .eq("property_id", propertyId)
      .in("status", ["ACTIVE", "SIGNED"])
      .order("contract_name");

    if (!contracts || contracts.length === 0) {
      setPropertyContracts([]);
      setSelectedSource("ad_hoc");
      return;
    }

    const contractIds = contracts.map((c) => c.id);
    const { data: lineItems } = await supabase
      .from("contract_line_items")
      .select("contract_id, service_catalog_id")
      .in("contract_id", contractIds);

    const enriched: ContractWithItems[] = contracts.map((c) => ({
      id: c.id,
      contract_name: c.contract_name,
      status: c.status,
      serviceIds: (lineItems ?? [])
        .filter((li) => li.contract_id === c.id)
        .map((li) => li.service_catalog_id),
    }));

    setPropertyContracts(enriched);
    setSelectedSource(enriched[0].id);
    applyContractServices(enriched[0]);
  };

  const checkCapacity = async () => {
    if (!selectedDate || !selectedTeamId) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const { count } = await supabase
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("team_id", selectedTeamId)
      .eq("scheduled_date", dateStr);
    setDaySlotCount(count ?? 0);
  };

  const applyContractServices = (contract: ContractWithItems) => {
    setSelectedServiceIds(contract.serviceIds);
    const contractServiceSet = new Set(contract.serviceIds);
    const firstMatchingCategory = services.find((s) => contractServiceSet.has(s.id))?.code;
    if (firstMatchingCategory) setSelectedCategory(firstMatchingCategory);
  };

  const handleSourceChange = (value: string) => {
    setSelectedSource(value);
    if (value === "ad_hoc") {
      setSelectedServiceIds([]);
      setSelectedCategory("");
    } else {
      const contract = propertyContracts.find((c) => c.id === value);
      if (contract) applyContractServices(contract);
    }
  };

  const filteredProperties = properties.filter((p) => p.customer_id === selectedCustomerId);
  const categories = [...new Set(services.map((s) => s.code as string))].sort();
  const filteredServices = services.filter((s) => s.code === selectedCategory);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPropertyId("");
    setSelectedDate(undefined);
    setSelectedSlot("08:00");
    setSelectedServiceIds([]);
    setSelectedCategory("");
    setNotes("");
    setPropertyContracts([]);
    setSelectedSource("ad_hoc");
    setDaySlotCount(0);
  };

  const isContractSource = selectedSource !== "ad_hoc";
  const activeContract = propertyContracts.find((c) => c.id === selectedSource);
  const capacityFull = daySlotCount >= 4;

  const getSlotEnd = (start: string) => {
    const [h, m] = start.split(":").map(Number);
    return `${String(h + 2).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const handleCreate = async () => {
    if (!selectedPropertyId || !selectedCustomerId || !selectedDate || selectedServiceIds.length === 0) {
      toast.error("Please fill in all required fields and select at least one service");
      return;
    }
    if (capacityFull) {
      toast.error("This team has reached max capacity (4 visits) for this day");
      return;
    }

    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const periodType = isContractSource ? "WEEK" as const : "ONE_TIME" as const;
      const slotLabel = TIME_SLOTS.find(s => s.value === selectedSlot)?.label || selectedSlot;
      const periodLabel = isContractSource && activeContract
        ? `${activeContract.contract_name} – ${format(selectedDate, "MMM d, yyyy")} ${slotLabel}`
        : `Ad hoc – ${format(selectedDate, "MMM d, yyyy")} ${slotLabel}`;

      const { data: order, error } = await supabase
        .from("service_orders")
        .insert({
          property_id: selectedPropertyId,
          scheduled_date: dateStr,
          scheduled_start_time: selectedSlot,
          scheduled_end_time: getSlotEnd(selectedSlot),
          team_id: selectedTeamId || null,
          status: "SCHEDULED",
          period_type: periodType,
          period_label: periodLabel,
          notes: notes.trim() || null,
          created_by_user_id: user!.id,
          contract_id: isContractSource ? selectedSource : null,
        })
        .select()
        .single();

      if (error) throw error;

      const itemSource = isContractSource ? "CONTRACT" as const : "AD_HOC" as const;
      const serviceItems = selectedServiceIds.map((svcId) => {
        const svc = services.find((s) => s.id === svcId);
        return {
          service_order_id: order.id,
          service_catalog_id: svcId,
          name: svc?.name ?? "Service",
          quantity: 1,
          source: itemSource,
        };
      });

      const { error: itemsError } = await supabase
        .from("service_order_items")
        .insert(serviceItems);

      if (itemsError) throw itemsError;

      toast.success("Visit created!");
      resetForm();
      onOpenChange(false);
      onCreated?.();
      navigate(`/provider/visits/${order.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Visit</DialogTitle>
          <DialogDescription>
            Schedule a service visit for a client property
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer *</Label>
            <Select
              value={selectedCustomerId}
              onValueChange={(v) => {
                setSelectedCustomerId(v);
                setSelectedPropertyId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.company_name ? ` (${c.company_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Property */}
          {selectedCustomerId && (
            <div className="space-y-2">
              <Label>Property *</Label>
              <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProperties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {filteredProperties.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No properties for this customer
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Source selector */}
          {selectedPropertyId && propertyContracts.length > 0 && (
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={selectedSource} onValueChange={handleSourceChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {propertyContracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.contract_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="ad_hoc">Ad-hoc</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Team selector */}
          {teams.length > 0 && (
            <div className="space-y-2">
              <Label>Team</Label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date & Time Slot */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time Slot *</Label>
              <Select value={selectedSlot} onValueChange={setSelectedSlot}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {capacityFull && (
                <p className="text-xs text-destructive">Team at max capacity (4/4 slots) for this day</p>
              )}
              {!capacityFull && daySlotCount > 0 && (
                <p className="text-xs text-muted-foreground">{daySlotCount}/4 slots used for this team</p>
              )}
            </div>
          </div>

          {/* Services */}
          <div className="space-y-2">
            <Label>Services * <span className="text-xs text-muted-foreground font-normal">(select category, then check services)</span></Label>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedCategory && (
              <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                {filteredServices.length > 0 ? filteredServices.map((svc) => (
                  <label
                    key={svc.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={selectedServiceIds.includes(svc.id)}
                      onCheckedChange={() => toggleService(svc.id)}
                    />
                    <span className="flex-1">{svc.name}</span>
                  </label>
                )) : (
                  <p className="text-xs text-muted-foreground text-center py-2">No services in this category</p>
                )}
              </div>
            )}

            {selectedServiceIds.length > 0 && (
              <div className="border rounded-md p-2 space-y-1 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground mb-1">Selected services ({selectedServiceIds.length})</p>
                {selectedServiceIds.map((id) => {
                  const svc = services.find((s) => s.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between text-sm px-2 py-1 rounded hover:bg-muted">
                      <span>{svc?.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{svc?.code}</span>
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline"
                          onClick={() => toggleService(id)}
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for this visit…"
              rows={2}
            />
          </div>

          <Button className="w-full" onClick={handleCreate} disabled={saving || capacityFull}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
              </>
            ) : (
              "Create Visit"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
