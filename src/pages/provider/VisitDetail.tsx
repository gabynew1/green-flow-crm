import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Save, CalendarIcon, Pencil, CheckCircle2, CalendarClock, Bot, UserPlus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, isSunday, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useWorkdays } from "@/hooks/useWorkdays";
import { getVisitScopeStatus } from "@/lib/contract-consumption";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  CANCELED: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
};

// Only these statuses are shown in the dropdown
const visibleStatuses = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELED"];

export default function VisitDetail() {
  const { tenantId } = useAuth();
  const { isWorkday, getNonWorkdayLabel } = useWorkdays(tenantId);
  const { visitId } = useParams();
  const navigate = useNavigate();
  const currency = useTenantCurrency();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [notes, setNotes] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>();
  const [clientSummary, setClientSummary] = useState("");
  const [completionDate, setCompletionDate] = useState<Date>(new Date());

  // Ad-hoc service picker state
  const [adHocCategory, setAdHocCategory] = useState<string | null>(null);
  const [adHocSelectedServices, setAdHocSelectedServices] = useState<string[]>([]);

  // Editable fields
  const [editScheduledDate, setEditScheduledDate] = useState<Date | undefined>();
  const [editPerformedDate, setEditPerformedDate] = useState<Date | undefined>();
  const [editPeriodLabel, setEditPeriodLabel] = useState("");
  const [editPeriodType, setEditPeriodType] = useState("");
  const [scopeMap, setScopeMap] = useState<Map<string, { inScope: boolean; consumed: number; max: number | null; periodLabel: string }>>(new Map());
  const [contractFlatFee, setContractFlatFee] = useState<{ isFlat: boolean; amount: number; frequency: string | null }>({ isFlat: false, amount: 0, frequency: null });

  useEffect(() => { load(); }, [visitId]);

  const load = async () => {
    const { data: o } = await supabase
      .from("service_orders")
      .select("*, properties(name, tenant_id, customers(name, id)), contracts(contract_name)")
      .eq("id", visitId!)
      .single();
    setOrder(o);
    setNotes(o?.notes || "");
    setClientSummary(o?.client_summary || "");
    if (o) {
      setEditScheduledDate(o.scheduled_date ? parseISO(o.scheduled_date) : undefined);
      setEditPerformedDate(o.performed_date ? parseISO(o.performed_date) : undefined);
      setEditPeriodLabel(o.period_label || "");
      setEditPeriodType(o.period_type || "WEEK");
    }

    const { data: itms } = await supabase
      .from("service_order_items")
      .select("*, service_catalog(default_price), contract_line_items:contract_line_item_id(unit_price)")
      .eq("service_order_id", visitId!)
      .order("source", { ascending: false });
    setItems(itms ?? []);

    const { data: cat } = await supabase.from("service_catalog").select("*").eq("is_active", true);
    setCatalog(cat ?? []);

    // Load scope status if linked to contract
    if (o?.contract_id) {
      const { data: ctr } = await supabase.from("contracts").select("start_date, end_date").eq("id", o.contract_id).single();
      const sm = await getVisitScopeStatus(visitId!, o.contract_id, ctr?.start_date, ctr?.end_date);
      setScopeMap(sm);

      // Detect flat-fee contract via the dedicated "Flat fee — …" line item
      const { data: cli } = await supabase
        .from("contract_line_items")
        .select("custom_name, unit_price, frequency_type")
        .eq("contract_id", o.contract_id);
      const flatRow = (cli ?? []).find((r: any) => typeof r.custom_name === "string" && r.custom_name.startsWith("Flat fee"));
      if (flatRow) {
        setContractFlatFee({ isFlat: true, amount: Number(flatRow.unit_price) || 0, frequency: (flatRow as any).frequency_type ?? null });
      } else {
        setContractFlatFee({ isFlat: false, amount: 0, frequency: null });
      }
    } else {
      setContractFlatFee({ isFlat: false, amount: 0, frequency: null });
    }
  };

  const toggleItem = async (itemId: string, current: boolean) => {
    await supabase.from("service_order_items").update({ is_completed: !current }).eq("id", itemId);
    load();
  };

  const isAutoBooked = !!order?.contract_id && !!order?.created_by_user_id === false;
  const isManual = !order?.contract_id || !!order?.created_by_user_id;

  const changeStatus = async (newStatus: string) => {
    // COMPLETED is final — cannot change away from it
    if (order.status === "COMPLETED") {
      toast.error("Completed visits cannot be reopened");
      return;
    }

    const updates: any = { status: newStatus };
    if (newStatus === "COMPLETED" && !order.performed_date) {
      updates.performed_date = new Date().toISOString().split("T")[0];
    }
    await supabase.from("service_orders").update(updates).eq("id", visitId!);
    toast.success(`Status changed to ${statusLabels[newStatus] || newStatus}`);
    load();
  };

  const sendVisitEmail = async (templateName: string, idempotencyKey: string) => {
    const customerId = (order.properties as any)?.customers?.id;
    const propertyTenantId = (order.properties as any)?.tenant_id;
    if (!customerId) return;
    const { data: clientProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("customer_id", customerId)
      .maybeSingle();
    const { data: tenant } = propertyTenantId
      ? await supabase.from("tenants").select("name").eq("id", propertyTenantId).single()
      : { data: null };
    if (clientProfile?.email) {
      const { sendAppEmail } = await import("@/lib/send-app-email");
      const contractItems = items.filter(i => i.source === "CONTRACT");
      const adHocItems = items.filter(i => i.source === "AD_HOC");
      const hasAdHocCost = adHocItems.length > 0;
      sendAppEmail({
        templateName,
        recipientEmail: clientProfile.email,
        idempotencyKey,
        tenantId: propertyTenantId ?? null,
        templateData: {
          propertyName: (order.properties as any)?.name,
          providerName: tenant?.name,
          performedDate: order.performed_date || order.scheduled_date,
          summary: clientSummary || order.client_summary || order.notes,
          contractServicesCount: contractItems.length,
          adHocServicesCount: adHocItems.length,
          hasAdditionalCost: hasAdHocCost,
          adHocServicesList: adHocItems.map(i => i.name).join(", "),
        },
      });
    }
  };

  const markAsDone = async () => {
    const updates: any = {
      status: "COMPLETED",
      performed_date: format(completionDate, "yyyy-MM-dd"),
      client_summary: clientSummary || null,
    };
    await supabase.from("service_orders").update(updates).eq("id", visitId!);
    toast.success("Visit completed and report sent to client!");
    await sendVisitEmail("visit-report", `visit-done-${visitId}`);
    load();
  };

  const sendReportToClient = async () => {
    await sendVisitEmail("visit-report", `visit-report-${visitId}-${Date.now()}`);
    toast.success("Report sent to client!");
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) { toast.error("Please select a new date"); return; }
    await supabase.from("service_orders").update({
      scheduled_date: format(rescheduleDate, "yyyy-MM-dd"),
      status: "SCHEDULED",
    }).eq("id", visitId!);
    toast.success(`Visit rescheduled to ${format(rescheduleDate, "PPP")}`);
    setRescheduleOpen(false);
    load();
  };

  const saveAll = async () => {
    const updates: any = {
      notes,
      client_summary: clientSummary || null,
      scheduled_date: editScheduledDate ? format(editScheduledDate, "yyyy-MM-dd") : null,
      performed_date: editPerformedDate ? format(editPerformedDate, "yyyy-MM-dd") : null,
      period_label: editPeriodLabel || null,
      period_type: editPeriodType,
    };
    const { error } = await supabase.from("service_orders").update(updates).eq("id", visitId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Visit updated!");
    setEditing(false);
    load();
  };

  // Ad-hoc service picker helpers
  const catalogCategories = [...new Set(catalog.map(s => s.code?.split("-")[0] || "Other"))];
  const getCategoryServices = (cat: string) => catalog.filter(s => (s.code?.split("-")[0] || "Other") === cat);

  const handleAddAdHocServices = async () => {
    if (adHocSelectedServices.length === 0) { toast.error("Select at least one service"); return; }
    const inserts = adHocSelectedServices.map(svcId => {
      const svc = catalog.find(c => c.id === svcId);
      return {
        service_order_id: visitId!,
        service_catalog_id: svcId,
        name: svc?.name || "Custom service",
        quantity: 1,
        unit: svc?.default_unit || "visit",
        source: "AD_HOC" as const,
        tenant_id: tenantId,
      };
    });
    const { error } = await supabase.from("service_order_items").insert(inserts);
    if (error) { toast.error(error.message); return; }
    toast.success(`${inserts.length} ad-hoc service(s) added!`);
    setAddOpen(false);
    setAdHocCategory(null);
    setAdHocSelectedServices([]);
    load();
  };

  if (!order) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const contractItems = items.filter(i => i.source === "CONTRACT");
  const adHocItems = items.filter(i => i.source === "AD_HOC");
  const isCompleted = order.status === "COMPLETED";
  const canMarkDone = ["SCHEDULED", "IN_PROGRESS"].includes(order.status);

  // Cost helpers
  const getItemPrice = (item: any): number => {
    // Flat-fee contracts: included (contract) services are covered by the flat fee.
    if (item.source === "CONTRACT" && contractFlatFee.isFlat) return 0;
    return item.unit_price
      ?? (item.contract_line_items as any)?.unit_price
      ?? (item.service_catalog as any)?.default_price
      ?? 0;
  };
  const getItemCost = (item: any): number => {
    return getItemPrice(item) * (item.quantity || 1);
  };
  const contractTotal = contractItems.reduce((s, i) => s + getItemCost(i), 0);
  const adHocTotal = adHocItems.reduce((s, i) => s + getItemCost(i), 0);
  const flatFeeAmount = contractFlatFee.isFlat ? contractFlatFee.amount : 0;
  const visitTotal = contractTotal + adHocTotal + flatFeeAmount;
  const flatFeeSuffix = contractFlatFee.frequency === "PER_YEAR" ? "/ year"
    : contractFlatFee.frequency === "ONE_TIME" ? ""
    : "/ month";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Service Visit</h1>
            {order.contract_id && !order.created_by_user_id ? (
              <Badge variant="outline" className="gap-1 text-xs">
                <Bot className="h-3 w-3" /> Auto-booked
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs">
                <UserPlus className="h-3 w-3" /> Manually created
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {(order.properties as any)?.name} · {(order.properties as any)?.customers?.name}
          </p>
        </div>
        {/* Status dropdown — COMPLETED is final */}
        <Select
          value={order.status}
          onValueChange={changeStatus}
          disabled={isCompleted}
        >
          <SelectTrigger className={cn("w-[180px] font-medium", statusColor[order.status] || "bg-muted text-muted-foreground")}>
            <SelectValue>{statusLabels[order.status] || order.status.replace(/_/g, " ")}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {visibleStatuses.map(s => (
              <SelectItem key={s} value={s}>
                <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs", statusColor[s])}>
                  {statusLabels[s]}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Completed banner */}
      {isCompleted && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-success">✓ Visit Completed</p>
            <p className="text-xs text-muted-foreground">Performed on {order.performed_date || "—"}. This visit is closed and cannot be reopened.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={sendReportToClient}>
            <Send className="h-3.5 w-3.5" /> Send Report to Client
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {canMarkDone && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Complete & Send Report
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Complete this visit?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently close the visit, set the performed date, and send a report to the client. <strong>Completed visits cannot be reopened.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                <Label>Performed date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !completionDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(completionDate, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={completionDate}
                      onSelect={(d) => d && setCompletionDate(d)}
                      disabled={(date) => date > new Date() || date < subDays(new Date(), 30)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">You can select up to 30 days in the past.</p>
                <Label>Summary for client (optional)</Label>
                <Textarea
                  value={clientSummary}
                  onChange={e => setClientSummary(e.target.value)}
                  placeholder="Brief summary of work done…"
                  rows={3}
                />
                {adHocItems.length > 0 && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <p className="text-sm font-medium text-warning">⚠️ Additional billing</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {adHocItems.length} ad-hoc service(s) will be billed separately: {adHocItems.map(i => i.name).join(", ")}
                    </p>
                  </div>
                )}
                {contractItems.length > 0 && adHocItems.length === 0 && (
                  <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                    <p className="text-sm font-medium text-success">✓ Fully covered by contract</p>
                    <p className="text-xs text-muted-foreground mt-1">All services are included in the contract — no additional charges.</p>
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={markAsDone}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Complete & Send
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {["SCHEDULED", "IN_PROGRESS"].includes(order.status) && (
          <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarClock className="h-4 w-4" /> Reschedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Reschedule Visit</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Current date: <span className="font-medium text-foreground">{order.scheduled_date}</span>
                </p>
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={setRescheduleDate}
                  initialFocus
                  className="rounded-md border pointer-events-auto"
                  modifiers={{ nonWorkday: (date) => !isWorkday(date) }}
                  modifiersStyles={{ nonWorkday: { color: 'hsl(var(--destructive))', fontWeight: 500 } }}
                />
                <Button onClick={handleReschedule} className="w-full" disabled={!rescheduleDate}>
                  <CalendarClock className="h-4 w-4 mr-2" /> Reschedule to {rescheduleDate ? format(rescheduleDate, "PPP") : "…"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Details card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Details</CardTitle>
          {!isCompleted && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(!editing)}>
              <Pencil className="h-4 w-4 mr-1" /> {editing ? "Cancel" : "Edit"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing && !isCompleted ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editScheduledDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editScheduledDate ? format(editScheduledDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editScheduledDate} onSelect={setEditScheduledDate} initialFocus className={cn("p-3 pointer-events-auto")} modifiers={{ nonWorkday: (date) => !isWorkday(date) }} modifiersStyles={{ nonWorkday: { color: 'hsl(var(--destructive))', fontWeight: 500 } }} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Performed Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editPerformedDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {editPerformedDate ? format(editPerformedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={editPerformedDate} onSelect={setEditPerformedDate} initialFocus className={cn("p-3 pointer-events-auto")} modifiers={{ nonWorkday: (date) => !isWorkday(date) }} modifiersStyles={{ nonWorkday: { color: 'hsl(var(--destructive))', fontWeight: 500 } }} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Period Label</Label>
                <Input value={editPeriodLabel} onChange={e => setEditPeriodLabel(e.target.value)} placeholder="e.g. Week 12" />
              </div>
              <div className="space-y-2">
                <Label>Period Type</Label>
                <Select value={editPeriodType} onValueChange={setEditPeriodType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEK">Week</SelectItem>
                    <SelectItem value="MONTH">Month</SelectItem>
                    <SelectItem value="ONE_TIME">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(order.contracts as any)?.contract_name && (
                <div className="sm:col-span-2">
                  <Label>Contract</Label>
                  <p className="text-sm text-muted-foreground mt-1">{(order.contracts as any).contract_name}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-4 text-sm">
              <div><span className="text-muted-foreground">Period:</span> {order.period_label} ({order.period_type})</div>
              <div><span className="text-muted-foreground">Scheduled:</span> {order.scheduled_date}</div>
              <div><span className="text-muted-foreground">Performed:</span> {order.performed_date || "—"}</div>
              {(order.contracts as any)?.contract_name && (
                <div><span className="text-muted-foreground">Contract:</span> {(order.contracts as any).contract_name}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Billing Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {contractFlatFee.isFlat && (
              <div className="rounded-lg border p-3 flex-1 min-w-[160px]">
                <p className="text-xs text-muted-foreground mb-1">Contract Flat Fee</p>
                <p className="text-lg font-semibold">{formatCurrency(flatFeeAmount, currency)} <span className="text-xs font-normal text-muted-foreground">{flatFeeSuffix}</span></p>
                <p className="text-xs text-muted-foreground">Covers included services</p>
              </div>
            )}
            <div className="rounded-lg border p-3 flex-1 min-w-[160px]">
              <p className="text-xs text-muted-foreground mb-1">Contract Services</p>
              <p className="text-lg font-semibold">{contractItems.length}</p>
              <p className="text-xs text-success">
                {contractFlatFee.isFlat ? "Included in flat fee" : formatCurrency(contractTotal, currency)}
              </p>
            </div>
            <div className="rounded-lg border p-3 flex-1 min-w-[160px]">
              <p className="text-xs text-muted-foreground mb-1">Ad-hoc Services</p>
              <p className="text-lg font-semibold">{adHocItems.length}</p>
              <p className={cn("text-xs font-medium", adHocItems.length > 0 ? "text-warning" : "text-muted-foreground")}>
                {adHocItems.length > 0 ? formatCurrency(adHocTotal, currency) : "No extra charges"}
              </p>
            </div>
            <div className="rounded-lg border p-3 flex-1 min-w-[160px] bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Visit Total</p>
              <p className="text-lg font-bold">{formatCurrency(visitTotal, currency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Services</h2>
        {!isCompleted && (
          <Dialog open={addOpen} onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) { setAdHocCategory(null); setAdHocSelectedServices([]); }
          }}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Ad-hoc Service</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Ad-hoc Service</DialogTitle></DialogHeader>
              <div className="space-y-4">
                {/* Category selection */}
                <div>
                  <Label className="mb-2 block">Select Category</Label>
                  <div className="flex flex-wrap gap-2">
                    {catalogCategories.map(cat => (
                      <Button
                        key={cat}
                        variant={adHocCategory === cat ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setAdHocCategory(adHocCategory === cat ? null : cat);
                          setAdHocSelectedServices([]);
                        }}
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Services in selected category */}
                {adHocCategory && (() => {
                  const catServices = getCategoryServices(adHocCategory);
                  const allSelected = catServices.every(s => adHocSelectedServices.includes(s.id));
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>{adHocCategory} Services</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (allSelected) {
                              setAdHocSelectedServices(prev => prev.filter(id => !catServices.some(s => s.id === id)));
                            } else {
                              setAdHocSelectedServices(prev => [...new Set([...prev, ...catServices.map(s => s.id)])]);
                            }
                          }}
                        >
                          {allSelected ? "Unselect all" : "Select all"}
                        </Button>
                      </div>
                      <div className="space-y-1 max-h-[300px] overflow-y-auto">
                        {catServices.map(svc => (
                          <label key={svc.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                            <Checkbox
                              checked={adHocSelectedServices.includes(svc.id)}
                              onCheckedChange={(checked) => {
                                setAdHocSelectedServices(prev =>
                                  checked ? [...prev, svc.id] : prev.filter(id => id !== svc.id)
                                );
                              }}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">{svc.name}</p>
                              {svc.description && <p className="text-xs text-muted-foreground">{svc.description}</p>}
                            </div>
                            {svc.default_unit && <span className="text-xs text-muted-foreground">{svc.default_unit}</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {adHocSelectedServices.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-3">{adHocSelectedServices.length} service(s) selected</p>
                    <Button onClick={handleAddAdHocServices} className="w-full">
                      <Plus className="h-4 w-4 mr-2" /> Add {adHocSelectedServices.length} Service(s)
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Contract services */}
      {contractItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Contract Services
            <Badge variant="secondary" className="text-xs">Covered</Badge>
          </p>
          {contractItems.map(item => {
            const scope = scopeMap.get(item.id);
            return (
              <Card key={item.id}>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => toggleItem(item.id, item.is_completed)}
                    disabled={isCompleted}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} {item.unit}
                      {scope?.max != null && <span className="ml-1">· {scope.consumed}/{scope.max} {scope.periodLabel}</span>}
                      {item.is_completed && <span className="ml-1 text-success">· Delivered</span>}
                      {!item.is_completed && isCompleted && <span className="ml-1 text-warning">· Not done</span>}
                    </p>
                  </div>
                  {!isCompleted ? (
                    <CurrencyInput
                      currency={currency}
                      className="h-7 w-28 text-xs"
                      defaultValue={getItemPrice(item) || ""}
                      placeholder="0.00"
                      onBlur={async (e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        await supabase.from("service_order_items").update({ unit_price: val } as any).eq("id", item.id);
                        toast.success("Price updated");
                        load();
                      }}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{formatCurrency(getItemCost(item), currency)}</span>
                  )}
                  <div className="flex items-center gap-1.5">
                    {scope && scope.max != null && (
                      <Badge
                        variant={scope.inScope ? "default" : "destructive"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {scope.inScope ? "In Scope" : "Extra"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs text-success border-success/30">CONTRACT</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Ad-hoc services */}
      {adHocItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Additional Services
            <Badge variant="secondary" className="text-xs text-warning">Extra billing</Badge>
          </p>
          {adHocItems.map(item => {
            const cost = getItemCost(item);
            return (
              <Card key={item.id}>
                <CardContent className="pt-4 pb-4 flex items-center gap-3">
                  <Checkbox
                    checked={item.is_completed}
                    onCheckedChange={() => toggleItem(item.id, item.is_completed)}
                    disabled={isCompleted}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} {item.unit}
                      {item.is_completed && <span className="ml-1 text-success">· Delivered</span>}
                      {!item.is_completed && isCompleted && <span className="ml-1 text-warning">· Not done</span>}
                    </p>
                  </div>
                  {!isCompleted ? (
                    <CurrencyInput
                      currency={currency}
                      className="h-7 w-28 text-xs"
                      defaultValue={getItemPrice(item) || ""}
                      placeholder="0.00"
                      onBlur={async (e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        await supabase.from("service_order_items").update({ unit_price: val } as any).eq("id", item.id);
                        toast.success("Price updated");
                        load();
                      }}
                    />
                  ) : (
                    <span className="text-sm font-medium text-warning">{formatCurrency(cost, currency)}</span>
                  )}
                  <Badge variant="outline" className="text-xs text-warning border-warning/30">AD_HOC</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {items.length === 0 && <p className="text-muted-foreground text-center py-4">No services in this visit</p>}

      {/* Client Summary */}
      <Card>
        <CardHeader><CardTitle className="text-base">Client Summary</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={clientSummary}
            onChange={e => setClientSummary(e.target.value)}
            placeholder="Summary visible to the client…"
            rows={3}
            disabled={isCompleted}
          />
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Internal Notes</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Internal notes (not visible to client)…"
            rows={4}
            disabled={isCompleted}
          />
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex flex-wrap gap-3 items-center">
        {!isCompleted && <Button onClick={saveAll}><Save className="h-4 w-4 mr-2" /> Save Changes</Button>}
        <div className="flex-1" />
        {!isCompleted && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2">
                <Trash2 className="h-4 w-4" /> Delete Visit
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this service visit?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this visit, all its service items, and any associated data. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    await supabase.from("service_order_items").delete().eq("service_order_id", visitId!);
                    const { error } = await supabase.from("service_orders").delete().eq("id", visitId!);
                    if (error) { toast.error(error.message); return; }
                    toast.success("Visit deleted");
                    navigate(-1);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
