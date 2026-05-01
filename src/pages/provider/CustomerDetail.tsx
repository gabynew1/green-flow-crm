import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import CreateAdHocVisitDialog from "@/components/provider/CreateAdHocVisitDialog";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, MapPin, FileText, Play, XCircle, Clock, Pencil, Save, X, Send, CalendarPlus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format, addYears } from "date-fns";
import { CustomerDashboard } from "@/components/provider/CustomerDashboard";
import { CloseContractDialog } from "@/components/provider/CloseContractDialog";

function getTimeRemaining(endDate: string | null): { label: string; urgent: boolean } | null {
  if (!endDate) return null;
  const now = new Date();
  const end = new Date(endDate);
  if (end <= now) return { label: "Expired", urgent: true };
  const diffMs = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths >= 2) return { label: `${diffMonths}mo`, urgent: false };
  return { label: `${diffDays}d`, urgent: diffDays <= 30 };
}

const billingCycleLabels: Record<string, string> = {
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
  ONE_TIME: "Ad hoc",
};

const statusColors: Record<string, string> = {
  DRAFT: "secondary",
  PENDING_NEW: "outline",
  ACTIVE: "default",
  PAUSED: "outline",
  TERMINATED: "destructive",
  REJECTED: "destructive",
};

const statusLabels: Record<string, string> = {
  PENDING_NEW: "Pending Approval",
  REJECTED: "Rejected",
};

export default function CustomerDetail() {
  const { customerId } = useParams();
  const { tenantId } = useAuth();
  const [customer, setCustomer] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [propOpen, setPropOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    contract_name: string;
    start_date: string;
    end_date: string;
    billing_cycle: "MONTHLY" | "YEARLY" | "ONE_TIME";
  }>({ contract_name: "", start_date: "", end_date: "", billing_cycle: "MONTHLY" });
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => { load(); }, [customerId]);

  const load = async () => {
    const [custRes, propRes, contractRes, profileRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId!).single(),
      supabase.from("properties").select("*").eq("customer_id", customerId!).order("name"),
      supabase.from("contracts").select("*, properties!inner(customer_id, name)").eq("properties.customer_id", customerId!).order("created_at", { ascending: false }),
      supabase.from("profiles").select("unique_client_id").eq("customer_id", customerId!).maybeSingle(),
    ]);
    setCustomer(custRes.data);
    setProperties(propRes.data ?? []);
    setContracts(contractRes.data ?? []);
    setClientId(profileRes.data?.unique_client_id ?? null);

    // Fetch visits for all customer properties
    const propIds = (propRes.data ?? []).map((p: any) => p.id);
    if (propIds.length > 0) {
      const { data: visitData } = await supabase
        .from("service_orders")
        .select("*, properties(name)")
        .in("property_id", propIds)
        .order("scheduled_date", { ascending: true });;
      setVisits(visitData ?? []);
    } else {
      setVisits([]);
    }
  };

  const handleCreateProperty = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("properties").insert({
      customer_id: customerId!,
      name: form.get("name") as string,
      city: form.get("city") as string,
      address: form.get("address") as string,
      description: form.get("description") as string,
      tenant_id: tenantId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Property added!");
    setPropOpen(false);
    load();
  };

  const renewContract = async (oldContract: any) => {
    const today = new Date();
    const newName = `${oldContract.contract_name} ${today.getFullYear()}`;
    const { data: newContract, error } = await supabase.from("contracts").insert({
      contract_name: newName,
      property_id: oldContract.property_id,
      start_date: format(today, "yyyy-MM-dd"),
      end_date: format(addYears(today, 1), "yyyy-MM-dd"),
      billing_cycle: oldContract.billing_cycle,
      visit_frequency_count: oldContract.visit_frequency_count,
      visit_frequency_type: oldContract.visit_frequency_type,
      status: "ACTIVE" as const,
      tenant_id: oldContract.tenant_id,
    } as any).select().single();
    if (error) { toast.error(error.message); return; }

    const { data: oldLines } = await supabase.from("contract_line_items").select("*").eq("contract_id", oldContract.id);
    if (oldLines && oldLines.length > 0) {
      const newLines = oldLines.map((li: any) => ({
        contract_id: newContract.id,
        service_catalog_id: li.service_catalog_id,
        custom_name: li.custom_name,
        frequency_type: li.frequency_type,
        quantity: li.quantity,
        unit: li.unit,
        notes: li.notes,
        tenant_id: li.tenant_id,
      }));
      await supabase.from("contract_line_items").insert(newLines);
    }
    toast.success("Contract renewed!");
    load();
  };

  const updateContractStatus = async (contractId: string, status: "ACTIVE" | "DRAFT" | "SENT_TO_CLIENT" | "SIGNED" | "CLOSED") => {
    if (status === "CLOSED") {
      // Use the dedicated end-of-day close flow with reason + audit + notifications.
      setCloseContractId(contractId);
      return;
    }
    const { error } = await supabase.from("contracts").update({ status }).eq("id", contractId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Contract ${status.toLowerCase()}`);
    load();
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditData({
      contract_name: c.contract_name,
      start_date: c.start_date,
      end_date: c.end_date || "",
      billing_cycle: c.billing_cycle,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("contracts").update({
      contract_name: editData.contract_name,
      start_date: editData.start_date,
      end_date: editData.end_date || null,
      billing_cycle: editData.billing_cycle as "MONTHLY" | "YEARLY" | "ONE_TIME",
    }).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract updated");
    setEditingId(null);
    load();
  };

  if (!customer) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const hasActiveContract = contracts.some((c) => c.status === "ACTIVE");

  // Group contracts by property
  const contractsByProperty = new Map<string, { propertyName: string; contracts: any[] }>();
  for (const c of contracts) {
    const propName = (c.properties as any)?.name || "Unknown";
    const propId = c.property_id;
    if (!contractsByProperty.has(propId)) {
      contractsByProperty.set(propId, { propertyName: propName, contracts: [] });
    }
    contractsByProperty.get(propId)!.contracts.push(c);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/provider/customers">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <Badge variant={hasActiveContract ? "default" : "secondary"}>
            {hasActiveContract ? "Active" : "Inactive"}
          </Badge>
        </div>
        <Link to={`/provider/customers/${customerId}/manage`}>
          <Button variant="outline" size="sm">Manage Account</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Contact:</span> {customer.contact_person_name || "—"}</div>
          <div><span className="text-muted-foreground">Email:</span> {customer.email || "—"}</div>
          <div><span className="text-muted-foreground">Phone:</span> {customer.phone || "—"}</div>
          <div><span className="text-muted-foreground">Company:</span> {customer.company_name || "—"}</div>
          {clientId && (
            <div><span className="text-muted-foreground">Client ID:</span> {clientId}</div>
          )}
          {customer.billing_address && (
            <div className="md:col-span-2"><span className="text-muted-foreground">Billing Address:</span> {customer.billing_address}</div>
          )}
          {customer.notes && (
            <div className="md:col-span-2"><span className="text-muted-foreground">Notes:</span> {customer.notes}</div>
          )}
        </CardContent>
      </Card>

      {/* Customer Dashboard */}
      <CustomerDashboard customerId={customerId!} contracts={contracts} visits={visits} />

      {/* Contracts Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Contracts</h2>
        <Button size="sm" asChild>
          <Link to={`/provider/contracts/new?customerId=${customerId}`}>
            <Plus className="h-4 w-4 mr-1" /> New Contract
          </Link>
        </Button>
      </div>

      {contracts.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">No contracts yet — create one to activate this client.</p>
      ) : (
        <div className="space-y-4">
          {Array.from(contractsByProperty.entries()).map(([propId, { propertyName, contracts: propContracts }]) => (
            <Card key={propId}>
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <Link to={`/provider/properties/${propId}`} className="font-medium text-sm hover:underline">{propertyName}</Link>
                </div>
                <div className="space-y-2 pl-6">
                  {propContracts.map((c: any) => {
                    const timeLeft = getTimeRemaining(c.end_date);
                    const isEditing = editingId === c.id;

                    if (isEditing) {
                      return (
                        <div key={c.id} className="border rounded-md p-3 space-y-3 bg-muted/30">
                          <div className="space-y-2">
                            <Label className="text-xs">Contract Name</Label>
                            <Input
                              value={editData.contract_name}
                              onChange={(e) => setEditData({ ...editData, contract_name: e.target.value })}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Start Date</Label>
                              <Input
                                type="date"
                                value={editData.start_date}
                                onChange={(e) => setEditData({ ...editData, start_date: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">End Date</Label>
                              <Input
                                type="date"
                                value={editData.end_date}
                                onChange={(e) => setEditData({ ...editData, end_date: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Billing</Label>
                              <Select value={editData.billing_cycle} onValueChange={(v) => setEditData({ ...editData, billing_cycle: v as any })}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="YEARLY">Yearly</SelectItem>
                                  <SelectItem value="MONTHLY">Monthly</SelectItem>
                                  <SelectItem value="ONE_TIME">Ad hoc</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveEdit} className="gap-1"><Save className="h-3 w-3" /> Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={c.id} className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <Link to={`/provider/contracts/${c.id}`} className="text-sm font-medium hover:underline">
                              {c.contract_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(c.start_date), "MMM d, yyyy")} → {c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "Ongoing"}
                              {" · "}{billingCycleLabels[c.billing_cycle] || c.billing_cycle}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.status === "ACTIVE" && timeLeft && (
                            <span className={`flex items-center gap-1 text-xs font-medium ${timeLeft.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                              <Clock className="h-3 w-3" />
                              {timeLeft.label}
                            </span>
                          )}
                          <Badge variant={statusColors[c.status] as any || "secondary"} className="text-[10px] px-1.5 py-0">
                            {statusLabels[c.status] || c.status}
                          </Badge>
                          {c.rejection_comment && c.status === "REJECTED" && (
                            <span className="text-xs text-destructive italic max-w-[200px] truncate" title={c.rejection_comment}>
                              "{c.rejection_comment}"
                            </span>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(c)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {c.status === "SENT_TO_CLIENT" && (
                            <span className="text-xs text-muted-foreground">Awaiting client</span>
                          )}
                          {c.status === "DRAFT" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateContractStatus(c.id, "SENT_TO_CLIENT")}>
                              <Send className="h-3 w-3 mr-1" /> Send
                            </Button>
                          )}
                          {c.status === "SIGNED" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateContractStatus(c.id, "ACTIVE")}>
                              <Play className="h-3 w-3 mr-1" /> Activate
                            </Button>
                          )}
                          {c.status === "ACTIVE" && (
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setCloseContractId(c.id)}>
                              <XCircle className="h-3 w-3 mr-1" /> Close
                            </Button>
                          )}
                          {c.status === "CLOSED" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => renewContract(c)}>
                              <RotateCcw className="h-3 w-3 mr-1" /> Renew
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Service Visits Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Service Visits</h2>
        <Button size="sm" onClick={() => setVisitOpen(true)}>
          <CalendarPlus className="h-4 w-4 mr-1" /> New Visit
        </Button>
      </div>

      {visits.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">No service visits yet</p>
      ) : (
        <div className="space-y-3">
          {visits.map((o) => (
            <Link key={o.id} to={`/provider/visits/${o.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="pt-4 pb-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{o.period_label || o.scheduled_date || "Unscheduled"}</p>
                    <p className="text-xs text-muted-foreground">
                      {(o.properties as any)?.name && <span>{(o.properties as any).name} · </span>}
                      {o.period_type} · {o.scheduled_date}
                    </p>
                  </div>
                  <Badge variant="secondary" className={
                    o.status === "COMPLETED" ? "bg-success/10 text-success" :
                    o.status === "CANCELED" ? "bg-destructive/10 text-destructive" :
                    o.status === "IN_PROGRESS" ? "bg-info/10 text-info" :
                    "bg-muted text-muted-foreground"
                  }>
                    {o.status.replace(/_/g, " ")}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Properties Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Properties</h2>
        <Dialog open={propOpen} onOpenChange={setPropOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Property</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Property</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateProperty} className="space-y-4">
              <div className="space-y-2"><Label>Name *</Label><Input name="name" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>City</Label><Input name="city" /></div>
                <div className="space-y-2"><Label>Address</Label><Input name="address" /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea name="description" rows={3} /></div>
              <Button type="submit" className="w-full">Add Property</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {properties.map((p) => (
          <Link key={p.id} to={`/provider/properties/${p.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{[p.address, p.city].filter(Boolean).join(", ") || "No address"}</p>
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="mt-2">{p.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {properties.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-8">No properties yet</p>
        )}
      </div>

      <CreateAdHocVisitDialog
        open={visitOpen}
        onOpenChange={setVisitOpen}
        onCreated={load}
        defaultCustomerId={customerId}
        defaultPropertyId={properties.length === 1 ? properties[0].id : undefined}
      />

      <CloseContractDialog
        contractId={closeContractId}
        tenantId={tenantId ?? null}
        open={!!closeContractId}
        onOpenChange={(o) => { if (!o) setCloseContractId(null); }}
        onClosed={load}
      />
    </div>
  );
}
