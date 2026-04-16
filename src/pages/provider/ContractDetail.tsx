import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getContractConsumption, type LineItemConsumption } from "@/lib/contract-consumption";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Play, XCircle, Send, Check, Undo2, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, getISOWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useWorkdays } from "@/hooks/useWorkdays";
import { generateSchedule, ExistingVisitMap } from "@/lib/schedule-engine";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

export default function ContractDetail() {
  const { contractId } = useParams();
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const { isWorkday } = useWorkdays(tenantId);
  const currency = useTenantCurrency();
  const [contract, setContract] = useState<any>(null);
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [consumption, setConsumption] = useState<LineItemConsumption[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [activating, setActivating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState("");
  const [addFormQty, setAddFormQty] = useState("1");
  const [addFormUnit, setAddFormUnit] = useState("visit");
  const [addFormUnitPrice, setAddFormUnitPrice] = useState("");
  const [addFormFrequency, setAddFormFrequency] = useState("PER_VISIT");
  const [addFormTimesPerFreq, setAddFormTimesPerFreq] = useState("1");

  useEffect(() => { load(); }, [contractId]);
  useEffect(() => { loadTeams(); }, [tenantId]);

  const load = async () => {
    const { data: c } = await supabase
      .from("contracts")
      .select("*, properties(id, name, customers(name))")
      .eq("id", contractId!)
      .single();
    setContract(c);
    const { data: li } = await supabase
      .from("contract_line_items")
      .select("*, service_catalog(name, code)")
      .eq("contract_id", contractId!)
      .order("created_at");
    setLineItems(li ?? []);

    const { data: cat } = await supabase.from("service_catalog").select("*").eq("is_active", true).order("name");
    setCatalog(cat ?? []);

    // Load consumption data for active contracts
    if (c && ["ACTIVE", "SIGNED"].includes(c.status)) {
      const cons = await getContractConsumption(contractId!, c.start_date, c.end_date);
      setConsumption(cons);
    }
  };

  const loadTeams = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("teams").select("*").eq("tenant_id", tenantId).order("created_at");
    const t = data ?? [];
    setTeams(t);
    if (t.length > 0 && !selectedTeamId) setSelectedTeamId(t[0].id);
  };

  const updateStatus = async (status: string) => {
    await supabase.from("contracts").update({ status, rejection_comment: null } as any).eq("id", contractId!);
    toast.success(`Contract ${status.replace(/_/g, " ").toLowerCase()}`);

    // Send email when contract is sent to client
    if (status === "SENT_TO_CLIENT" && contract) {
      const customerId = (contract.properties as any)?.customers?.id || (contract.properties as any)?.customer_id;
      if (customerId) {
        const { data: clientProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("customer_id", customerId)
          .maybeSingle();
        const { data: tenant } = tenantId
          ? await supabase.from("tenants").select("name").eq("id", tenantId).single()
          : { data: null };
        if (clientProfile?.email) {
          const { sendAppEmail } = await import("@/lib/send-app-email");
          sendAppEmail({
            templateName: "contract-sent",
            recipientEmail: clientProfile.email,
            idempotencyKey: `contract-sent-${contractId}`,
            templateData: {
              contractName: contract.contract_name,
              propertyName: (contract.properties as any)?.name,
              providerName: tenant?.name,
            },
          });
        }
      }
    }

    load();
  };

  const handleActivate = async () => {
    if (!contract || !user) return;
    setActivating(true);

    try {
      // Update status to ACTIVE
      await supabase.from("contracts").update({ status: "ACTIVE", rejection_comment: null } as any).eq("id", contractId!);

      const freqCount = contract.visit_frequency_count || 0;
      const freqType = contract.visit_frequency_type || "WEEK";

      if (freqCount > 0 && lineItems.length > 0 && selectedTeamId) {
        // Build existing visit occupancy map for the team
        const { data: existingOrders } = await supabase
          .from("service_orders")
          .select("scheduled_date, team_id")
          .eq("team_id", selectedTeamId)
          .not("scheduled_date", "is", null);

        const occupancy: ExistingVisitMap = {};
        for (const o of existingOrders ?? []) {
          const key = `${o.scheduled_date}_${o.team_id}`;
          occupancy[key] = (occupancy[key] || 0) + 1;
        }

        const itemsForSchedule = lineItems.map(li => ({
          id: li.id,
          service_catalog_id: li.service_catalog_id,
          name: li.custom_name || (li.service_catalog as any)?.name || "Service",
          quantity: li.quantity,
          unit: li.unit,
        }));

        const visits = generateSchedule(
          {
            startDate: contract.start_date,
            endDate: contract.end_date,
            frequencyCount: freqCount,
            frequencyType: freqType,
            teamId: selectedTeamId,
            contractId: contractId!,
            propertyId: (contract.properties as any).id,
            userId: user.id,
            contractName: contract.contract_name,
            lineItems: itemsForSchedule,
          },
          { isWorkday },
          occupancy
        );

        if (visits.length > 0) {
          // Batch insert service orders
          const { data: createdOrders, error: soError } = await supabase
            .from("service_orders")
            .insert(visits)
            .select("id");

          if (soError) throw soError;

          // Create service order items for each visit
          const allItems = (createdOrders ?? []).flatMap(so =>
            itemsForSchedule.map(li => ({
              service_order_id: so.id,
              contract_line_item_id: li.id,
              service_catalog_id: li.service_catalog_id,
              name: li.name,
              quantity: li.quantity,
              unit: li.unit,
              source: "CONTRACT" as const,
            }))
          );

          if (allItems.length > 0) {
            await supabase.from("service_order_items").insert(allItems);
          }

          const teamName = teams.find(t => t.id === selectedTeamId)?.name || "Team";
          toast.success(`Contract activated! ${visits.length} visits scheduled for ${teamName}`);
        } else {
          toast.success("Contract activated (no visits could be scheduled)");
        }
      } else {
        toast.success("Contract activated");
      }

      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActivating(false);
    }
  };

  const loadInventoryItems = async () => {
    if (!contract?.properties?.id) return;
    const { data: inv } = await supabase.from("inventory").select("id").eq("property_id", (contract.properties as any).id).maybeSingle();
    if (inv) {
      const { data: items } = await supabase.from("inventory_items").select("*").eq("inventory_id", inv.id).order("name");
      setInventoryItems(items ?? []);
    } else {
      setInventoryItems([]);
    }
  };

  const handleAddDialogOpen = (open: boolean) => {
    setAddOpen(open);
    if (open) {
      setSelectedCategory("");
      setSelectedServiceId("");
      setSelectedInventoryItemId("");
      setAddFormQty("1");
      setAddFormUnit("visit");
      setAddFormUnitPrice("");
      setAddFormFrequency("PER_VISIT");
      setAddFormTimesPerFreq("1");
      loadInventoryItems();
    }
  };

  const categories = [...new Set(catalog.map(s => s.code))].sort();
  const filteredServices = selectedCategory ? catalog.filter(s => s.code === selectedCategory) : [];

  const handleServiceSelect = (serviceId: string) => {
    setSelectedServiceId(serviceId);
    const svc = catalog.find(s => s.id === serviceId);
    if (svc) {
      if (svc.default_price != null) setAddFormUnitPrice(String(svc.default_price));
      if (svc.default_unit) setAddFormUnit(svc.default_unit);
    }
  };
  const handleInventorySelect = (itemId: string) => {
    setSelectedInventoryItemId(itemId);
    if (itemId) {
      const item = inventoryItems.find(i => i.id === itemId);
      if (item) {
        setAddFormQty(String(item.quantity ?? 1));
        setAddFormUnit(item.unit || "count");
      }
    }
  };

  const handleAddLine = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedServiceId) { toast.error("Please select a service"); return; }
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("contract_line_items").insert([{
      contract_id: contractId!,
      service_catalog_id: selectedServiceId,
      custom_name: (form.get("custom_name") as string) || null,
      frequency_type: addFormFrequency as "PER_VISIT" | "PER_WEEK" | "PER_MONTH" | "PER_YEAR" | "ONE_TIME",
      quantity: Number(addFormQty) || 1,
      unit: addFormUnit,
      notes: (form.get("notes") as string) || null,
      max_occurrences_per_period: addFormFrequency !== "ONE_TIME" && addFormFrequency !== "PER_VISIT" ? (Number(addFormTimesPerFreq) || 1) : null,
      unit_price: addFormUnitPrice ? Number(addFormUnitPrice) : null,
    }] as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Line item added!");
    setAddOpen(false);
    load();
  };

  const deleteLine = async (id: string) => {
    await supabase.from("contract_line_items").delete().eq("id", id);
    setLineItems(prev => prev.filter(li => li.id !== id));
    toast.success("Line item removed");
  };

  const recreateFromOffer = async () => {
    if (!contract?.offer_id) return;
    await supabase.from("contract_line_items").delete().eq("contract_id", contractId!);
    const { data: offerLines } = await supabase
      .from("offer_line_items")
      .select("*, service_catalog(name, code)")
      .eq("offer_id", contract.offer_id);
    if (offerLines && offerLines.length > 0) {
      const newLines = offerLines.map(li => ({
        contract_id: contractId!,
        service_catalog_id: li.service_catalog_id,
        custom_name: li.custom_name,
        quantity: li.quantity,
        unit: li.unit,
        notes: li.notes,
      }));
      await supabase.from("contract_line_items").insert(newLines);
    }
    await supabase.from("contracts").update({ status: "DRAFT", rejection_comment: null } as any).eq("id", contractId!);
    toast.success("Contract recreated from offer");
    load();
  };

  const generateVisit = async () => {
    if (!contract || lineItems.length === 0) { toast.error("No line items to generate from"); return; }
    const now = new Date();
    const periodLabel = contract.billing_cycle === "WEEKLY"
      ? `${format(now, "yyyy")}-W${String(getISOWeek(now)).padStart(2, "0")}`
      : format(now, "yyyy-MM");
    const periodType = contract.billing_cycle === "WEEKLY" ? "WEEK" : contract.billing_cycle === "ONE_TIME" ? "ONE_TIME" : "MONTH";

    const { data: so, error } = await supabase.from("service_orders").insert({
      property_id: (contract.properties as any).id,
      contract_id: contractId!,
      scheduled_date: format(now, "yyyy-MM-dd"),
      period_type: periodType,
      period_label: periodLabel,
      status: "SCHEDULED",
      created_by_user_id: user?.id,
      team_id: selectedTeamId || null,
    }).select().single();

    if (error) { toast.error(error.message); return; }

    const items = lineItems.map(li => ({
      service_order_id: so.id,
      contract_line_item_id: li.id,
      service_catalog_id: li.service_catalog_id,
      name: li.custom_name || (li.service_catalog as any)?.name || "Service",
      quantity: li.quantity,
      unit: li.unit,
      source: "CONTRACT" as const,
    }));

    await supabase.from("service_order_items").insert(items);
    toast.success("Service visit generated!");
  };

  if (!contract) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const editable = !["CLOSED", "REJECTED"].includes(contract.status);
  const canRevert = ["SENT_TO_CLIENT", "SIGNED", "REJECTED"].includes(contract.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/contracts"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{contract.contract_name}</h1>
          <p className="text-sm text-muted-foreground">
            {(contract.properties as any)?.customers?.name} · {(contract.properties as any)?.name}
          </p>
        </div>
        <Badge variant={contract.status === "REJECTED" ? "destructive" : "secondary"}>{contract.status.replace(/_/g, " ")}</Badge>
      </div>

      {contract.rejection_comment && contract.status === "REJECTED" && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-destructive font-medium">Client rejection reason:</p>
            <p className="text-sm text-muted-foreground mt-1 italic">"{contract.rejection_comment}"</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 text-sm">
          <div><span className="text-muted-foreground">Period:</span> {contract.start_date} → {contract.end_date || "Ongoing"}</div>
          <div><span className="text-muted-foreground">Billing:</span> {contract.billing_cycle}</div>
          <div><span className="text-muted-foreground">Frequency:</span> {contract.visit_frequency_count ?? 1}x / {contract.visit_frequency_type || "WEEK"}</div>
          <div className="flex gap-2 ml-auto flex-wrap items-center">
            {/* Team selector for activation */}
            {contract.status === "SIGNED" && teams.length > 0 && (
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {canRevert && (
              <Button size="sm" variant="ghost" onClick={() => updateStatus("DRAFT")}>
                <Undo2 className="h-3 w-3 mr-1" /> Revert to Draft
              </Button>
            )}
            {contract.status === "REJECTED" && contract.offer_id && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline"><RefreshCw className="h-3 w-3 mr-1" /> Recreate from Offer</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Recreate contract from offer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete existing line items and re-copy them from the original offer, then reset the contract to Draft.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={recreateFromOffer}>Recreate</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {contract.status === "DRAFT" && <Button size="sm" onClick={() => updateStatus("SENT_TO_CLIENT")}><Send className="h-3 w-3 mr-1" /> Send to Client</Button>}
            {contract.status === "SENT_TO_CLIENT" && <Button size="sm" onClick={() => updateStatus("SIGNED")}><Check className="h-3 w-3 mr-1" /> Mark Signed</Button>}
            {contract.status === "SIGNED" && (
              <Button size="sm" onClick={handleActivate} disabled={activating}>
                {activating ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Scheduling…</> : <><Play className="h-3 w-3 mr-1" /> Activate</>}
              </Button>
            )}
            {contract.status === "ACTIVE" && (
              <Button size="sm" variant="destructive" onClick={() => updateStatus("CLOSED")}><XCircle className="h-3 w-3 mr-1" /> Close</Button>
            )}
            {contract.status === "ACTIVE" && (
              <Button size="sm" onClick={generateVisit}>Generate Visit</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Line Items</h2>
        {editable && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={async () => {
              const existingIds = new Set(lineItems.map(li => li.service_catalog_id));
              const toAdd = catalog.filter(s => !existingIds.has(s.id));
              if (toAdd.length === 0) { toast.info("All catalog services already added"); return; }
              const inserts = toAdd.map(s => ({
                contract_id: contractId!,
                service_catalog_id: s.id,
                quantity: 1,
                frequency_type: "PER_VISIT" as const,
                unit: s.default_unit || "visit",
              }));
              const { error } = await supabase.from("contract_line_items").insert(inserts);
              if (error) { toast.error(error.message); return; }
              toast.success(`${toAdd.length} service(s) added`);
              load();
            }}>Add All</Button>
          <Dialog open={addOpen} onOpenChange={handleAddDialogOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Line</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Line Item</DialogTitle></DialogHeader>
              <form onSubmit={handleAddLine} className="space-y-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setSelectedServiceId(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Service *</Label>
                  <Select value={selectedServiceId} onValueChange={handleServiceSelect} disabled={!selectedCategory}>
                    <SelectTrigger><SelectValue placeholder={selectedCategory ? "Select service" : "Select category first"} /></SelectTrigger>
                    <SelectContent>
                      {filteredServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.default_price != null ? ` — ${formatCurrency(s.default_price, currency)}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {inventoryItems.length > 0 && (
                  <div className="space-y-2">
                    <Label>Inventory Item (optional)</Label>
                    <Select value={selectedInventoryItemId} onValueChange={handleInventorySelect}>
                      <SelectTrigger><SelectValue placeholder="Link to asset…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— None —</SelectItem>
                        {inventoryItems.map(i => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} — {i.quantity ?? "?"} {i.unit || ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2"><Label>Custom Name (optional)</Label><Input name="custom_name" /></div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={addFormFrequency} onValueChange={(v) => { setAddFormFrequency(v); if (v === "ONE_TIME" || v === "PER_VISIT") setAddFormTimesPerFreq("1"); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PER_VISIT">Per Visit</SelectItem>
                      <SelectItem value="PER_WEEK">Per Week</SelectItem>
                      <SelectItem value="PER_MONTH">Per Month</SelectItem>
                      <SelectItem value="ONE_TIME">One-time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(addFormFrequency === "PER_WEEK" || addFormFrequency === "PER_MONTH") && (
                  <div className="space-y-2">
                    <Label>Times per {addFormFrequency === "PER_WEEK" ? "week" : "month"}</Label>
                    <Input type="number" value={addFormTimesPerFreq} onChange={e => setAddFormTimesPerFreq(e.target.value)} min="1" placeholder="1" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity *</Label><Input type="number" value={addFormQty} onChange={e => setAddFormQty(e.target.value)} required min="1" /></div>
                  <div className="space-y-2"><Label>Unit</Label><Input value={addFormUnit} onChange={e => setAddFormUnit(e.target.value)} /></div>
                </div>
                <div className="space-y-2">
                  <Label>Unit Price *</Label>
                  <Input type="number" step="0.01" required min="0" placeholder="0.00" value={addFormUnitPrice} onChange={e => setAddFormUnitPrice(e.target.value)} />
                </div>
                <div className="space-y-2"><Label>Notes</Label><Input name="notes" /></div>
                <Button type="submit" className="w-full">Add</Button>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {lineItems.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No line items yet</p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
             <TableHead>Service</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Line Total</TableHead>
                <TableHead>Max/Period</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map(li => (
                <TableRow key={li.id}>
                  <TableCell className="font-medium">{li.custom_name || (li.service_catalog as any)?.name}</TableCell>
                  <TableCell>{li.frequency_type.replace(/_/g, " ")}</TableCell>
                  <TableCell>{li.quantity}</TableCell>
                  <TableCell>{li.unit}</TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        type="number"
                        step="0.01"
                        className="h-7 w-20 text-xs"
                        placeholder="0.00"
                        defaultValue={li.unit_price ?? ""}
                        onBlur={async (e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          if (val === li.unit_price) return;
                          await supabase.from("contract_line_items").update({ unit_price: val } as any).eq("id", li.id);
                          toast.success("Price updated");
                          load();
                        }}
                      />
                    ) : (
                      <span>{li.unit_price != null ? formatCurrency(Number(li.unit_price), currency) : "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {li.unit_price != null ? formatCurrency(Number(li.unit_price) * Number(li.quantity), currency) : "—"}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        type="number"
                        className="h-7 w-16 text-xs"
                        placeholder="∞"
                        defaultValue={li.max_occurrences_per_period ?? ""}
                        onBlur={async (e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          if (val === li.max_occurrences_per_period) return;
                          await supabase.from("contract_line_items").update({ max_occurrences_per_period: val } as any).eq("id", li.id);
                          toast.success("Max updated");
                          load();
                        }}
                      />
                    ) : (
                      <span>{li.max_occurrences_per_period ?? "∞"}</span>
                    )}
                  </TableCell>
                  {editable && (
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => deleteLine(li.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {/* Total row */}
          {lineItems.some(li => li.unit_price != null) && (
            <div className="border-t px-4 py-2 flex justify-between text-sm font-semibold">
              <span>Contract Total</span>
              <span>{formatCurrency(lineItems.reduce((sum, li) => sum + (li.unit_price != null ? Number(li.unit_price) * Number(li.quantity) : 0), 0), currency)}</span>
            </div>
          )}
        </div>
      )}

      {/* Consumption Summary */}
      {["ACTIVE", "SIGNED"].includes(contract?.status) && consumption.length > 0 && consumption.some(c => c.maxOccurrences !== null) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Consumption Summary</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {consumption.filter(c => c.maxOccurrences !== null).map(c => {
              const pct = c.maxOccurrences! > 0 ? Math.min(100, (c.consumed / c.maxOccurrences!) * 100) : 0;
              return (
                <div key={c.lineItemId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.serviceName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{c.consumed}/{c.maxOccurrences} {c.periodLabel}</span>
                      <Badge
                        variant={c.isOverScope ? "destructive" : "default"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {c.isOverScope ? "Over Scope" : "In Scope"}
                      </Badge>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
