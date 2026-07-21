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
import { ArrowLeft, Plus, Save, CalendarIcon, Pencil, CheckCircle2, Bot, UserPlus, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, isSunday, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useWorkdays } from "@/hooks/useWorkdays";
import { getVisitScopeStatus } from "@/lib/contract-consumption";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { visitStatusColor, visitStatusLabel } from "@/lib/visit-status";
import { ZoneChip } from "@/components/provider/ZoneChip";
import VisitActionRow from "@/components/visits/VisitActionRow";

const statusColor = new Proxy({} as Record<string, string>, {
  get: (_t, key: string) => visitStatusColor(key),
});
const statusLabels = new Proxy({} as Record<string, string>, {
  get: (_t, key: string) => visitStatusLabel(key),
});

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
      .select("*, properties(name, tenant_id, customers(name, id), service_zones(id, name, color)), contracts(contract_name)")
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

    const visitTenantId = (o?.properties as any)?.tenant_id ?? tenantId;
    const { data: cat } = visitTenantId
      ? await supabase
          .from("service_catalog")
          .select("*")
          .eq("is_active", true)
          .eq("tenant_id", visitTenantId)
      : { data: [] as any[] };
    setCatalog(cat ?? []);

    // Load scope status if linked to contract
    if (o?.contract_id) {
      const { data: ctr } = await supabase.from("contracts").select("start_date, end_date").eq("id", o.contract_id).single();
      const sm = await getVisitScopeStatus(visitId!, o.contract_id, ctr?.start_date, ctr?.end_date);
      setScopeMap(sm);

      // Detect flat-fee contract. Prefer the SSOT flag `is_included_in_base_fee`
      // on any linked contract line; fall back to the legacy "Flat fee — …"
      // sibling-row heuristic for contracts created before the flag existed.
      const { data: cli } = await supabase
        .from("contract_line_items")
        .select("custom_name, unit_price, frequency_type, is_included_in_base_fee")
        .eq("contract_id", o.contract_id);
      const rows = cli ?? [];
      const flatRow = rows.find((r: any) => typeof r.custom_name === "string" && r.custom_name.startsWith("Flat fee"));
      const hasIncludedFlag = rows.some((r: any) => r.is_included_in_base_fee === true);
      if (flatRow) {
        setContractFlatFee({ isFlat: true, amount: Number(flatRow.unit_price) || 0, frequency: (flatRow as any).frequency_type ?? null });
      } else if (hasIncludedFlag) {
        setContractFlatFee({ isFlat: true, amount: 0, frequency: null });
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
    // Surface the auto-generated draft invoice, if any
    try {
      const { data: inv } = await supabase
        .from("invoices")
        .select("id, invoice_number")
        .eq("service_order_id", visitId!)
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (inv?.id) {
        toast.success("Draft invoice created", {
          description: "Review the amounts and issue when ready.",
          action: {
            label: "Open",
            onClick: () => window.location.assign(`/provider/invoices/${inv.id}`),
          },
        });
      }
    } catch { /* ignore */ }
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
            {order.needs_client_action && (
              <Badge variant="outline" className="text-xs border-warning text-warning">Needs client review</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {(order.properties as any)?.name} · {(order.properties as any)?.customers?.name}
          </p>
          {(order.properties as any)?.service_zones?.name && (
            <div className="mt-1">
              <ZoneChip
                name={(order.properties as any).service_zones.name}
                color={(order.properties as any).service_zones.color}
              />
            </div>
          )}
        </div>
        {/* Read-only status badge — all transitions live in the action row below */}
        <Badge className={cn("text-sm px-3 py-1.5", statusColor[order.status] || "bg-muted text-muted-foreground")}>
          {statusLabels[order.status] || order.status.replace(/_/g, " ")}
        </Badge>
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

        {/* Unified action row: Check-In · Reschedule · Cancel · (Rebook/Delete when canceled) */}
        <VisitActionRow
          visit={order}
          onChanged={load}
          // Complete flow lives in the dedicated Complete & Send Report dialog above,
          // so we don't pass onComplete here to avoid duplicate buttons.
        />
        {!isCompleted && (
          <Button onClick={saveAll} className="gap-2">
            <Save className="h-4 w-4" /> Save Changes
          </Button>
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
                    contractFlatFee.isFlat ? (
                      <span className="text-xs text-muted-foreground italic">Included in flat fee</span>
                    ) : (
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
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {contractFlatFee.isFlat ? "Included in flat fee" : formatCurrency(getItemCost(item), currency)}
                    </span>
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

    </div>
  );
}
