import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Building2, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Customers() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => { loadCustomers(); }, []);

  const loadCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("*, properties(id)")
      .order("name");
    setCustomers(data ?? []);
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("customers").insert({
      name: form.get("name") as string,
      contact_person_name: form.get("contact") as string,
      email: form.get("email") as string,
      phone: form.get("phone") as string,
      company_name: form.get("company") as string,
      billing_address: form.get("address") as string,
      notes: form.get("notes") as string,
      tenant_id: profile?.tenant_id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Customer created!");
    setOpen(false);
    loadCustomers();
  };

  const handleConnect = async () => {
    if (!clientId.trim()) {
      toast.error("Enter a client ID");
      return;
    }
    setConnectLoading(true);
    try {
      // Look up the client by unique_client_id
      const { data: clientProfile, error: lookupErr } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .eq("unique_client_id", clientId.trim().toUpperCase())
        .single();

      if (lookupErr || !clientProfile) {
        toast.error("No client found with that ID");
        setConnectLoading(false);
        return;
      }

      // Get tenant name for display
      let tenantName = "Service Provider";
      if (profile?.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", profile.tenant_id)
          .single();
        if (tenant) tenantName = tenant.name;
      }

      // Create connection request
      const { error } = await supabase.from("client_connections").insert({
        tenant_id: profile?.tenant_id,
        client_user_id: clientProfile.user_id,
        provider_name: tenantName,
        requested_by: (await supabase.auth.getUser()).data.user?.id,
      });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success(`Connection request sent to ${clientProfile.full_name || "client"}!`);
        setConnectOpen(false);
        setClientId("");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
    setConnectLoading(false);
  };

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.company_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Customers</h1>
        <div className="flex gap-2">
          <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><UserPlus className="h-4 w-4 mr-2" /> Connect Client</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Connect to a Client</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ask your client for their unique GreenCRM ID (e.g. GC-A7X3K2) and enter it below.
                </p>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="GC-XXXXXX"
                    className="font-mono"
                  />
                </div>
                <Button onClick={handleConnect} disabled={connectLoading} className="w-full">
                  {connectLoading ? "Sending…" : "Send Connection Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Customer</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2"><Label>Name *</Label><Input name="name" required /></div>
                <div className="space-y-2"><Label>Contact Person</Label><Input name="contact" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input name="phone" /></div>
                </div>
                <div className="space-y-2"><Label>Company</Label><Input name="company" /></div>
                <div className="space-y-2"><Label>Billing Address</Label><Textarea name="address" rows={2} /></div>
                <div className="space-y-2"><Label>Notes</Label><Textarea name="notes" rows={2} /></div>
                <Button type="submit" className="w-full">Create Customer</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <Link key={c.id} to={`/provider/customers/${c.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    {c.company_name && <p className="text-sm text-muted-foreground truncate">{c.company_name}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{c.email}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {(c.properties as any[])?.length ?? 0} properties
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-8">No customers found</p>
        )}
      </div>
    </div>
  );
}
