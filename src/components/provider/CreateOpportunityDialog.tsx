import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { createActionTask } from "@/hooks/useActionTasks";
import { Users, UserPlus, Link as LinkIcon, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateOpportunityDialog({ open, onOpenChange }: Props) {
  const { user, profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("existing");

  // Existing customer form
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  // New customer form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newPropertyName, setNewPropertyName] = useState("");
  const [newPropertyAddress, setNewPropertyAddress] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Client ID form
  const [clientId, setClientId] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [idTitle, setIdTitle] = useState("");
  const [idNotes, setIdNotes] = useState("");

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const loadData = async () => {
    if (!profile?.tenant_id) return;
    const [custRes, propRes] = await Promise.all([
      supabase.from("customers").select("id, name, email, company_name").eq("tenant_id", profile.tenant_id).order("name"),
      supabase.from("properties").select("id, name, customer_id").eq("tenant_id", profile.tenant_id).order("name"),
    ]);
    setCustomers(custRes.data ?? []);
    setProperties(propRes.data ?? []);
  };

  const filteredProperties = properties.filter(p => p.customer_id === selectedCustomerId);

  const resetForm = () => {
    setSelectedCustomerId("");
    setSelectedPropertyId("");
    setTitle("");
    setNotes("");
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewCompany("");
    setNewPropertyName("");
    setNewPropertyAddress("");
    setNewTitle("");
    setNewNotes("");
    setClientId("");
    setLookupResult(null);
    setIdTitle("");
    setIdNotes("");
    setTab("existing");
  };

  const createInspection = async (propertyId: string, customerId: string, inspTitle: string, inspNotes: string) => {
    const { error } = await supabase.from("inspections").insert({
      title: inspTitle,
      property_id: propertyId,
      customer_id: customerId,
      tenant_id: profile?.tenant_id,
      notes: inspNotes || null,
      created_by: user!.id,
    });
    if (error) throw error;
  };

  // Tab 1: Existing customer
  const handleExisting = async () => {
    if (!selectedPropertyId || !selectedCustomerId || !title.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await createInspection(selectedPropertyId, selectedCustomerId, title, notes);
      toast.success("Opportunity created!");
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Tab 2: New customer
  const handleNew = async () => {
    if (!newName.trim() || !newPropertyName.trim() || !newTitle.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    const trimmedEmail = newEmail.trim();
    if (trimmedEmail && profile?.tenant_id) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id, name")
        .eq("tenant_id", profile.tenant_id)
        .ilike("email", trimmedEmail)
        .neq("status", "DELETED")
        .limit(1);
      if (existing && existing.length > 0) {
        toast.error(`A customer with this email already exists: ${existing[0].name}`);
        return;
      }
    }
    setSaving(true);
    try {
      const customerId = crypto.randomUUID();
      const { error: custErr } = await supabase.from("customers").insert({
        id: customerId,
        name: newName.trim(),
        email: trimmedEmail || null,
        phone: newPhone.trim() || null,
        company_name: newCompany.trim() || null,
        tenant_id: profile?.tenant_id,
      });
      if (custErr) throw custErr;

      const propertyId = crypto.randomUUID();
      const { error: propErr } = await supabase.from("properties").insert({
        id: propertyId,
        name: newPropertyName.trim(),
        address: newPropertyAddress.trim() || null,
        customer_id: customerId,
        tenant_id: profile?.tenant_id,
      });
      if (propErr) throw propErr;

      await createInspection(propertyId, customerId, newTitle, newNotes);
      toast.success("Customer, property, and opportunity created!");
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Tab 3: Client ID lookup
  const handleLookup = async () => {
    if (!clientId.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    const { data } = await supabase
      .rpc("lookup_client_by_code", { _code: clientId.trim().toUpperCase() });
    const row = Array.isArray(data) ? data[0] : null;
    setLookupResult(row || "NOT_FOUND");
    setLookupLoading(false);
  };

  const handleConnectAndCreate = async () => {
    if (!lookupResult || lookupResult === "NOT_FOUND" || !idTitle.trim()) {
      toast.error("Fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      let customerId = lookupResult.customer_id;

      // If client has no customer record, create one
      if (!customerId) {
        customerId = crypto.randomUUID();
        const { error: custErr } = await supabase.from("customers").insert({
          id: customerId,
          name: lookupResult.full_name || lookupResult.email || "Client",
          email: lookupResult.email,
          tenant_id: profile?.tenant_id,
        });
        if (custErr) throw custErr;
      }

      // Send connection request via the action_tasks workflow so it appears
      // under Sent / Pending / Activity for both parties.
      await createActionTask({
        task_type: "link_request",
        tenant_id: profile!.tenant_id!,
        target_user_id: lookupResult.user_id,
        target_role: "CLIENT_USER",
        subject_entity_type: "tenant",
        subject_entity_id: profile!.tenant_id!,
        payload: {
          provider_tenant_id: profile!.tenant_id,
          provider_name: profile?.full_name || "Provider",
          client_unique_id: lookupResult.unique_client_id,
          client_full_name: lookupResult.full_name,
        },
      });

      // Check if client has properties
      const { data: clientProps } = await supabase
        .from("properties")
        .select("id")
        .eq("customer_id", customerId)
        .limit(1);

      let propertyId: string;
      if (clientProps && clientProps.length > 0) {
        propertyId = clientProps[0].id;
      } else {
        propertyId = crypto.randomUUID();
        const { error: propErr } = await supabase.from("properties").insert({
          id: propertyId,
          name: `${lookupResult.full_name || "Client"}'s Property`,
          customer_id: customerId,
          tenant_id: profile?.tenant_id,
        });
        if (propErr) throw propErr;
      }

      await createInspection(propertyId, customerId, idTitle, idNotes);
      toast.success("Connection sent & opportunity created!");
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Opportunity</DialogTitle>
          <DialogDescription>Start a new pipeline entry by selecting or creating a client</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="existing" className="gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" /> Existing
            </TabsTrigger>
            <TabsTrigger value="new" className="gap-1.5 text-xs">
              <UserPlus className="h-3.5 w-3.5" /> New Client
            </TabsTrigger>
            <TabsTrigger value="connect" className="gap-1.5 text-xs">
              <LinkIcon className="h-3.5 w-3.5" /> Client ID
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Existing Customer */}
          <TabsContent value="existing" className="space-y-4 mt-4">
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
              <Label>Title *</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Initial Site Assessment" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
            </div>
            <Button className="w-full" onClick={handleExisting} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create Opportunity"}
            </Button>
          </TabsContent>

          {/* Tab 2: New Customer */}
          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Acme Inc." />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+1 555-0100" />
              </div>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Property</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Property Name *</Label>
                  <Input value={newPropertyName} onChange={e => setNewPropertyName(e.target.value)} placeholder="Main Garden" />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input value={newPropertyAddress} onChange={e => setNewPropertyAddress(e.target.value)} placeholder="123 Oak St" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Inspection Title *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Initial Site Assessment" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
            </div>
            <Button className="w-full" onClick={handleNew} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create Client & Opportunity"}
            </Button>
          </TabsContent>

          {/* Tab 3: Connect by Client ID */}
          <TabsContent value="connect" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Client ID (GC-XXXXXX)</Label>
              <div className="flex gap-2">
                <Input
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="GC-ABC123"
                  className="font-mono uppercase"
                />
                <Button variant="outline" onClick={handleLookup} disabled={lookupLoading || !clientId.trim()}>
                  {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
                </Button>
              </div>
            </div>

            {lookupResult === "NOT_FOUND" && (
              <p className="text-sm text-destructive">No client found with this ID</p>
            )}

            {lookupResult && lookupResult !== "NOT_FOUND" && (
              <div className="border rounded-lg p-3 bg-muted/50 space-y-1">
                <p className="text-sm font-medium">{lookupResult.full_name || "—"}</p>
                <p className="text-xs text-muted-foreground">{lookupResult.email}</p>
                <p className="text-xs text-muted-foreground">ID: {lookupResult.unique_client_id}</p>
              </div>
            )}

            {lookupResult && lookupResult !== "NOT_FOUND" && (
              <>
                <div className="space-y-2">
                  <Label>Inspection Title *</Label>
                  <Input value={idTitle} onChange={e => setIdTitle(e.target.value)} placeholder="e.g. Initial Site Assessment" />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={idNotes} onChange={e => setIdNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
                </div>
                <Button className="w-full" onClick={handleConnectAndCreate} disabled={saving}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Connect & Create Opportunity"}
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
