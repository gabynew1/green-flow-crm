import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useWorkdays } from "@/hooks/useWorkdays";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerCombobox } from "@/components/pickers/CustomerCombobox";
import { PropertyCombobox } from "@/components/pickers/PropertyCombobox";
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
import { TEAM_DAY_WARNING_THRESHOLD } from "@/lib/scheduling-constants";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (createdServiceOrderId?: string) => void;
  defaultCustomerId?: string;
  defaultPropertyId?: string;
}

interface ContractLine {
  id: string;
  service_catalog_id: string | null;
  custom_name: string | null;
  quantity: number | null;
  unit: string | null;
}

interface ContractWithItems {
  id: string;
  contract_name: string;
  status: string;
  lines: ContractLine[];
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
  { value: "16:00", label: "16:00 – 18:00" },
];

export default function CreateAdHocVisitDialog({ open, onOpenChange, onCreated, defaultCustomerId, defaultPropertyId }: Props) {
  const { user, tenantId } = useAuth();
  const { isWorkday } = useWorkdays(tenantId);
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
  const [slotMode, setSlotMode] = useState<"preset" | "custom">("preset");
  const [customStart, setCustomStart] = useState("09:00");
  const [customEnd, setCustomEnd] = useState("11:00");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
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
      tenantId ? supabase.from("customers").select("id, name").eq("tenant_id", tenantId).eq("status", "ACTIVE").order("name") : Promise.resolve({ data: [] }),
      tenantId ? supabase.from("properties").select("id, name, customer_id").eq("tenant_id", tenantId).order("name") : Promise.resolve({ data: [] }),
      tenantId ? supabase.from("service_catalog").select("id, name, code").eq("is_active", true).eq("tenant_id", tenantId).order("name") : Promise.resolve({ data: [] }),
      tenantId ? supabase.from("teams").select("id, name, color").eq("tenant_id", tenantId).order("created_at") : Promise.resolve({ data: [] }),
    ]);
    const loadedTeams = (teamRes.data ?? []) as Team[];
    setCustomers(custRes.data ?? []);
    setProperties(propRes.data ?? []);
    setServices(svcRes.data ?? []);
    setTeams(loadedTeams);
    if (loadedTeams.length > 0 && !selectedTeamId) setSelectedTeamId(loadedTeams[0].id);

    if (defaultCustomerId) {
      setSelectedCustomerId(defaultCustomerId);
      if (defaultPropertyId) setSelectedPropertyId(defaultPropertyId);
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
      .select("id, contract_id, service_catalog_id, custom_name, quantity, unit")
      .in("contract_id", contractIds);

    const enriched: ContractWithItems[] = contracts.map((c) => ({
      id: c.id,
      contract_name: c.contract_name,
      status: c.status,
      lines: (lineItems ?? [])
        .filter((li) => li.contract_id === c.id && !(li.custom_name ?? "").startsWith("Flat fee"))
        .map((li) => ({
          id: li.id,
          service_catalog_id: li.service_catalog_id,
          custom_name: li.custom_name,
          quantity: li.quantity,
          unit: li.unit,
        })),
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

  /** Categories (service codes) covered by a contract's own line items. */
  const contractCategories = (contract: ContractWithItems): string[] => {
    const ids = new Set(contract.lines.map((l) => l.service_catalog_id));
    return [...new Set(services.filter((s) => ids.has(s.id)).map((s) => s.code as string))].sort();
  };

  const applyContractServices = (contract: ContractWithItems) => {
    setSelectedCategories(contractCategories(contract));
  };

  const handleSourceChange = (value: string) => {
    setSelectedSource(value);
    if (value === "ad_hoc") {
      setSelectedCategories([]);
    } else {
      const contract = propertyContracts.find((c) => c.id === value);
      if (contract) applyContractServices(contract);
    }
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPropertyId("");
    setSelectedDate(undefined);
    setSelectedSlot("08:00");
    setSlotMode("preset");
    setCustomStart("09:00");
    setCustomEnd("11:00");
    setSelectedCategories([]);
    setNotes("");
    setPropertyContracts([]);
    setSelectedSource("ad_hoc");
    setDaySlotCount(0);
  };

  const isContractSource = selectedSource !== "ad_hoc";
  const activeContract = propertyContracts.find((c) => c.id === selectedSource);
  const isHeavyDay = daySlotCount >= TEAM_DAY_WARNING_THRESHOLD;
  const availableCategories = activeContract ? contractCategories(activeContract) : [];
  const codeById = new Map(services.map((s) => [s.id, s.code as string]));
  const nameById = new Map(services.map((s) => [s.id, s.name as string]));
  /** Contract lines that fall inside the selected categories — these become the visit's items. */
  const linesToAdd = activeContract
    ? activeContract.lines.filter((l) =>
        l.service_catalog_id ? selectedCategories.includes(codeById.get(l.service_catalog_id) ?? "") : false,
      )
    : [];

  const toggleCategory = (code: string) => {
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const getSlotEnd = (start: string) => {
    const [h, m] = start.split(":").map(Number);
    return `${String(h + 2).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const handleCreate = async () => {
    if (!selectedPropertyId || !selectedCustomerId || !selectedDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (isContractSource && linesToAdd.length === 0) {
      toast.error("Select at least one service category from the contract");
      return;
    }
    if (slotMode === "custom") {
      if (!customStart || !customEnd || customEnd <= customStart) {
        toast.error("Custom time end must be after start (HH:MM)");
        return;
      }
    }
    // Capacity is a soft advisory only — never block creation.
    if (isHeavyDay) {
      toast.warning(`Heavy day: this team already has ${daySlotCount} visits scheduled`);
    }

    setSaving(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const periodType = isContractSource ? "WEEK" as const : "ONE_TIME" as const;
      const startTime = slotMode === "custom" ? customStart : selectedSlot;
      const endTime = slotMode === "custom" ? customEnd : getSlotEnd(selectedSlot);
      const slotLabel =
        slotMode === "custom"
          ? `${customStart} – ${customEnd}`
          : TIME_SLOTS.find((s) => s.value === selectedSlot)?.label || selectedSlot;
      const periodLabel = isContractSource && activeContract
        ? `${activeContract.contract_name} – ${format(selectedDate, "MMM d, yyyy")} ${slotLabel}`
        : `Ad hoc – ${format(selectedDate, "MMM d, yyyy")} ${slotLabel}`;

      const { data: order, error } = await supabase
        .from("service_orders")
        .insert({
          property_id: selectedPropertyId,
          scheduled_date: dateStr,
          scheduled_start_time: startTime,
          scheduled_end_time: endTime,
          team_id: selectedTeamId || null,
          status: "SCHEDULED",
          period_type: periodType,
          period_label: periodLabel,
          notes: notes.trim() || null,
          created_by_user_id: user!.id,
          contract_id: isContractSource ? selectedSource : null,
          tenant_id: tenantId,
        })
        .select()
        .single();

      if (error) throw error;

      // Ad-hoc visits start empty — services are added on the visit detail page.
      if (linesToAdd.length > 0) {
        const serviceItems = linesToAdd.map((l) => ({
          service_order_id: order.id,
          service_catalog_id: l.service_catalog_id,
          contract_line_item_id: l.id,
          name: l.custom_name || nameById.get(l.service_catalog_id ?? "") || "Service",
          quantity: l.quantity ?? 1,
          unit: l.unit,
          source: "CONTRACT" as const,
          tenant_id: tenantId,
        }));

        const { error: itemsError } = await supabase
          .from("service_order_items")
          .insert(serviceItems);

        if (itemsError) throw itemsError;
      }

      toast.success("Visit created!");
      resetForm();
      onOpenChange(false);
      onCreated?.(order.id);
      navigate(`/provider/visits/${order.id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-2xl w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto flex flex-col">
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
            <CustomerCombobox
              value={selectedCustomerId || null}
              onChange={(id) => {
                setSelectedCustomerId(id || "");
                setSelectedPropertyId("");
              }}
              allowClear={false}
            />
          </div>

          {/* Property */}
          {selectedCustomerId && (
            <div className="space-y-2">
              <Label>Property *</Label>
              <PropertyCombobox
                value={selectedPropertyId || null}
                onChange={(id) => setSelectedPropertyId(id || "")}
                customerId={selectedCustomerId || undefined}
                allowClear={false}
                allowGeneral
              />
              <p className="text-[11px] text-muted-foreground">
                No site yet? Pick "No specific location" and continue.
              </p>
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
                    modifiers={{ nonWorkday: (date) => !isWorkday(date) }}
                    modifiersStyles={{ nonWorkday: { color: 'hsl(var(--destructive))', fontWeight: 500 } }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time Slot *</Label>
              <div className="flex border border-border rounded-md overflow-hidden text-xs">
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5",
                    slotMode === "preset" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                  onClick={() => setSlotMode("preset")}
                >
                  Preset
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 py-1.5 border-l border-border",
                    slotMode === "custom" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                  onClick={() => setSlotMode("custom")}
                >
                  Custom
                </button>
              </div>
              {slotMode === "preset" ? (
                <Select value={selectedSlot} onValueChange={setSelectedSlot}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="flex-1"
                  />
                </div>
              )}
              {isHeavyDay ? (
                <p className="text-xs text-warning">Heavy day: this team already has {daySlotCount} visits scheduled</p>
              ) : daySlotCount > 0 ? (
                <p className="text-xs text-muted-foreground">{daySlotCount} visit{daySlotCount === 1 ? "" : "s"} already on this team for this day</p>
              ) : null}
            </div>
          </div>

          {/* Services */}
          <div className="space-y-2">
            {isContractSource ? (
              <>
                <Label>
                  Service categories *{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    (only services included in this contract are added)
                  </span>
                </Label>
                {availableCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {availableCategories.map((cat) => {
                      const active = selectedCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={cn(
                            "px-3 py-1.5 rounded-full border text-xs transition-colors",
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-muted border-border",
                          )}
                        >
                          {cat}
                          {active && <X className="inline h-3 w-3 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This contract has no service lines yet.
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {linesToAdd.length} contract service{linesToAdd.length === 1 ? "" : "s"} will be added to this visit.
                </p>
              </>
            ) : (
              <>
                <Label>Services</Label>
                <p className="text-xs text-muted-foreground">
                  Ad-hoc visits are created empty — add the services you deliver on the visit page.
                </p>
              </>
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

          <Button className="w-full" onClick={handleCreate} disabled={saving}>
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
