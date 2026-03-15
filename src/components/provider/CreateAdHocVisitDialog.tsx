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
}

export default function CreateAdHocVisitDialog({ open, onOpenChange, onCreated }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    const [custRes, propRes, svcRes] = await Promise.all([
      supabase.from("customers").select("id, name, company_name").order("name"),
      supabase.from("properties").select("id, name, customer_id").order("name"),
      supabase.from("service_catalog").select("id, name, code").eq("is_active", true).order("name"),
    ]);
    setCustomers(custRes.data ?? []);
    setProperties(propRes.data ?? []);
    setServices(svcRes.data ?? []);
  };

  const filteredProperties = properties.filter((p) => p.customer_id === selectedCustomerId);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPropertyId("");
    setSelectedDate(undefined);
    setSelectedTime("09:00");
    setSelectedServiceIds([]);
    setSelectedCategory("");
    setNotes("");
  };

  const handleCreate = async () => {
    if (!selectedPropertyId || !selectedCustomerId || !selectedDate || selectedServiceIds.length === 0) {
      toast.error("Please fill in all required fields and select at least one service");
      return;
    }

    setSaving(true);
    try {
      // Build scheduled_date with time
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // Create the service order
      const { data: order, error } = await supabase
        .from("service_orders")
        .insert({
          property_id: selectedPropertyId,
          scheduled_date: dateStr,
          status: "SCHEDULED",
          period_type: "ONE_TIME",
          period_label: `Ad hoc – ${format(selectedDate, "MMM d, yyyy")} at ${selectedTime}`,
          notes: notes.trim() || null,
          created_by_user_id: user!.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create service order items from selected services
      const serviceItems = selectedServiceIds.map((svcId) => {
        const svc = services.find((s) => s.id === svcId);
        return {
          service_order_id: order.id,
          service_catalog_id: svcId,
          name: svc?.name ?? "Service",
          quantity: 1,
          source: "AD_HOC" as const,
        };
      });

      const { error: itemsError } = await supabase
        .from("service_order_items")
        .insert(serviceItems);

      if (itemsError) throw itemsError;

      toast.success("Ad-hoc visit created!");
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
          <DialogTitle>Create Ad-hoc Visit</DialogTitle>
          <DialogDescription>
            Schedule a one-time service visit for a client property
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

          {/* Date & Time */}
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
              <Label>Time *</Label>
              <Input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
              />
            </div>
          </div>

          {/* Services multi-select */}
          <div className="space-y-2">
            <Label>Services * <span className="text-xs text-muted-foreground font-normal">(select one or more)</span></Label>
            <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1">
              {services.map((svc) => (
                <label
                  key={svc.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                >
                  <Checkbox
                    checked={selectedServiceIds.includes(svc.id)}
                    onCheckedChange={() => toggleService(svc.id)}
                  />
                  <span className="flex-1">{svc.name}</span>
                  <span className="text-xs text-muted-foreground">{svc.code}</span>
                </label>
              ))}
              {services.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  No services in catalog
                </p>
              )}
            </div>
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
