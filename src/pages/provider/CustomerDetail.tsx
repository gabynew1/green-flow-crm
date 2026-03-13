import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, MapPin, FileText, Play, Pause, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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

const statusColors: Record<string, string> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  PAUSED: "outline",
  TERMINATED: "destructive",
};

export default function CustomerDetail() {
  const { customerId } = useParams();
  const [customer, setCustomer] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [propOpen, setPropOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");

  useEffect(() => { load(); }, [customerId]);

  const load = async () => {
    const [custRes, propRes, contractRes] = await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId!).single(),
      supabase.from("properties").select("*").eq("customer_id", customerId!).order("name"),
      supabase.from("contracts").select("*, properties!inner(customer_id, name)").eq("properties.customer_id", customerId!).order("created_at", { ascending: false }),
    ]);
    setCustomer(custRes.data);
    setProperties(propRes.data ?? []);
    setContracts(contractRes.data ?? []);
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
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Property added!");
    setPropOpen(false);
    load();
  };

  const handleCreateContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const startDate = form.get("start_date") as string;
    const endDate = form.get("end_date") as string;
    const propertyId = selectedPropertyId;

    if (!propertyId) { toast.error("Select a property"); return; }
    if (!startDate || !endDate) { toast.error("Start and end dates are required"); return; }

    const { error } = await supabase.from("contracts").insert({
      contract_name: form.get("contract_name") as string,
      property_id: propertyId,
      start_date: startDate,
      end_date: endDate,
      billing_cycle: (form.get("billing_cycle") as string) || "MONTHLY",
      status: "ACTIVE",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Contract created & client activated!");
    setContractOpen(false);
    setSelectedPropertyId("");
    load();
  };

  const updateContractStatus = async (contractId: string, status: string) => {
    const { error } = await supabase.from("contracts").update({ status }).eq("id", contractId);
    if (error) { toast.error(error.message); return; }
    toast.success(`Contract ${status.toLowerCase()}`);
    load();
  };

  if (!customer) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const hasActiveContract = contracts.some((c) => c.status === "ACTIVE");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/customers">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <Badge variant={hasActiveContract ? "default" : "secondary"}>
          {hasActiveContract ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6 grid md:grid-cols-2 gap-4 text-sm">
          <div><span className="text-muted-foreground">Contact:</span> {customer.contact_person_name || "—"}</div>
          <div><span className="text-muted-foreground">Email:</span> {customer.email || "—"}</div>
          <div><span className="text-muted-foreground">Phone:</span> {customer.phone || "—"}</div>
          <div><span className="text-muted-foreground">Company:</span> {customer.company_name || "—"}</div>
          {customer.billing_address && (
            <div className="md:col-span-2"><span className="text-muted-foreground">Billing Address:</span> {customer.billing_address}</div>
          )}
          {customer.notes && (
            <div className="md:col-span-2"><span className="text-muted-foreground">Notes:</span> {customer.notes}</div>
          )}
        </CardContent>
      </Card>

      {/* Contracts Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Contracts</h2>
        <Dialog open={contractOpen} onOpenChange={setContractOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Contract</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Contract</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateContract} className="space-y-4">
              <div className="space-y-2">
                <Label>Contract Name *</Label>
                <Input name="contract_name" required placeholder="e.g. Annual Maintenance 2026" />
              </div>
              <div className="space-y-2">
                <Label>Property *</Label>
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date *</Label>
                  <Input name="start_date" type="date" required />
                </div>
                <div className="space-y-2">
                  <Label>End Date *</Label>
                  <Input name="end_date" type="date" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Billing Cycle</Label>
                <Select name="billing_cycle" defaultValue="MONTHLY">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                    <SelectItem value="ONE_TIME">One Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create & Activate</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contracts.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">No contracts yet — create one to activate this client.</p>
      ) : (
        <div className="grid gap-3">
          {contracts.map((c) => {
            const timeLeft = getTimeRemaining(c.end_date);
            return (
              <Card key={c.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <Link to={`/provider/contracts/${c.id}`} className="font-medium hover:underline">
                          {c.contract_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {(c.properties as any)?.name} · {format(new Date(c.start_date), "MMM d, yyyy")} → {c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "Ongoing"}
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
                      <Badge variant={statusColors[c.status] as any || "secondary"}>
                        {c.status}
                      </Badge>
                      {c.status === "DRAFT" && (
                        <Button size="sm" variant="outline" onClick={() => updateContractStatus(c.id, "ACTIVE")}>
                          <Play className="h-3 w-3 mr-1" /> Activate
                        </Button>
                      )}
                      {c.status === "ACTIVE" && (
                        <Button size="sm" variant="outline" onClick={() => updateContractStatus(c.id, "PAUSED")}>
                          <Pause className="h-3 w-3 mr-1" /> Pause
                        </Button>
                      )}
                      {c.status === "PAUSED" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => updateContractStatus(c.id, "ACTIVE")}>
                            <Play className="h-3 w-3 mr-1" /> Resume
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => updateContractStatus(c.id, "TERMINATED")}>
                            <XCircle className="h-3 w-3 mr-1" /> Terminate
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
    </div>
  );
}
