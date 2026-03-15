import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, UserPlus, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

function getContractTimeRemaining(endDate: string | null): { label: string; urgent: boolean } | null {
  if (!endDate) return null;
  const now = new Date();
  const end = new Date(endDate);
  if (end <= now) return { label: "Expired", urgent: true };

  const diffMs = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30);

  if (diffMonths >= 2) {
    return { label: `${diffMonths}mo`, urgent: false };
  }
  return { label: `${diffDays}d`, urgent: diffDays <= 30 };
}

export default function Customers() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [custRes, contractRes] = await Promise.all([
      supabase.from("customers").select("*, properties(id)").order("name"),
      supabase.from("contracts").select("id, status, end_date, property_id, properties(customer_id)"),
    ]);
    setCustomers(custRes.data ?? []);
    setContracts(contractRes.data ?? []);
  };

  // Build a map: customer_id -> { hasActive, latestEndDate }
  const customerContractMap = new Map<string, { hasActive: boolean; latestEndDate: string | null }>();
  for (const c of contracts) {
    const custId = (c.properties as any)?.customer_id;
    if (!custId) continue;
    const existing = customerContractMap.get(custId) || { hasActive: false, latestEndDate: null };
    if (c.status === "ACTIVE") {
      existing.hasActive = true;
      if (!existing.latestEndDate || (c.end_date && c.end_date > existing.latestEndDate)) {
        existing.latestEndDate = c.end_date;
      }
    }
    customerContractMap.set(custId, existing);
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
    loadData();
  };

  const handleConnect = async () => {
    if (!clientId.trim()) {
      toast.error("Enter a client ID");
      return;
    }
    setConnectLoading(true);
    try {
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

      let tenantName = "Service Provider";
      if (profile?.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("name")
          .eq("id", profile.tenant_id)
          .single();
        if (tenant) tenantName = tenant.name;
      }

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

  const filtered = customers
    .filter((c: any) => c.status !== "DELETED")
    .filter((c) =>
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
        {filtered.map((c) => {
          const contractInfo = customerContractMap.get(c.id);
          const isActive = contractInfo?.hasActive ?? false;
          const timeRemaining = contractInfo?.latestEndDate
            ? getContractTimeRemaining(contractInfo.latestEndDate)
            : null;

          return (
            <Link key={c.id} to={`/provider/customers/${c.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isActive ? "bg-primary/10" : "bg-muted"}`}>
                      <Building2 className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{c.name}</p>
                        <Badge
                          variant={isActive ? "default" : "secondary"}
                          className={`shrink-0 text-[10px] px-1.5 py-0 ${isActive ? "" : "text-muted-foreground"}`}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      {c.company_name && <p className="text-sm text-muted-foreground truncate">{c.company_name}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{c.email}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-xs text-muted-foreground">
                          {(c.properties as any[])?.length ?? 0} properties
                        </p>
                        {isActive && timeRemaining && (
                          <span className={`flex items-center gap-1 text-xs font-medium ${timeRemaining.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                            <Clock className="h-3 w-3" />
                            {timeRemaining.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-muted-foreground col-span-full text-center py-8">No customers found</p>
        )}
      </div>
    </div>
  );
}
