import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MapPin,
  CalendarDays,
  Home,
  ClipboardCheck,
  Plus,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

export default function ClientDashboard() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);
  const [upcomingVisits, setUpcomingVisits] = useState<any[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [completedVisits, setCompletedVisits] = useState(0);
  const [pendingContracts, setPendingContracts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    description: "",
  });

  useEffect(() => {
    if (user) load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    const [propsRes, upcomingRes, totalRes, doneRes, pendingRes] = await Promise.all([
      supabase.from("properties").select("*").order("name"),
      supabase
        .from("service_orders")
        .select("id, scheduled_date, period_label, status, property_id, properties(name)")
        .gte("scheduled_date", today)
        .order("scheduled_date")
        .limit(5),
      supabase.from("service_orders").select("id", { count: "exact", head: true }),
      supabase.from("service_orders").select("id", { count: "exact", head: true }).not("performed_date", "is", null),
      supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "PENDING_NEW"),
    ]);

    setProperties(propsRes.data ?? []);
    setUpcomingVisits(upcomingRes.data ?? []);
    setTotalVisits(totalRes.count ?? 0);
    setCompletedVisits(doneRes.count ?? 0);
    setPendingContracts(pendingRes.count ?? 0);
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("customer_id, full_name, email")
      .eq("user_id", user!.id)
      .single();

    let customerId = profileData?.customer_id;

    if (!customerId) {
      if (!profileData) {
        toast.error("Could not load your profile.");
        return;
      }
      const generatedCustomerId = crypto.randomUUID();
      const { error: custErr } = await supabase
        .from("customers")
        .insert({
          id: generatedCustomerId,
          name: profileData.full_name || profileData.email || "Client",
          email: profileData.email,
        });
      if (custErr) { toast.error("Could not create customer record: " + custErr.message); return; }
      const { error: linkErr } = await supabase
        .from("profiles")
        .update({ customer_id: generatedCustomerId })
        .eq("user_id", user!.id);
      if (linkErr) { toast.error("Could not link customer to profile: " + linkErr.message); return; }
      customerId = generatedCustomerId;
    }

    setSaving(true);
    const { error } = await supabase.from("properties").insert({
      name: form.name.trim(),
      address: form.address.trim() || null,
      city: form.city.trim() || null,
      description: form.description.trim() || null,
      customer_id: customerId,
    });
    setSaving(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Property added!");
      setForm({ name: "", address: "", city: "", description: "" });
      setDialogOpen(false);
      load();
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "SENT_TO_CLIENT": return "default";
      case "CLIENT_APPROVED": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-8">
      {/* Pending contracts banner */}
      {pendingContracts > 0 && (
        <Link to="/client/contracts">
          <Card className="border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  You have {pendingContracts} contract{pendingContracts > 1 ? "s" : ""} awaiting your approval
                </p>
                <p className="text-xs text-muted-foreground">Click to review and approve or reject</p>
              </div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Property
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Property</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="prop-name">Name *</Label>
                <Input id="prop-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My Garden" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="prop-address">Address</Label>
                  <Input id="prop-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prop-city">City</Label>
                  <Input id="prop-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="prop-desc">Description</Label>
                <Textarea id="prop-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Add Property"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3"><Home className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Properties</p>
                <p className="text-2xl font-bold">{properties.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3"><CalendarDays className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Upcoming Visits</p>
                <p className="text-2xl font-bold">{upcomingVisits.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="rounded-lg bg-primary/10 p-3"><ClipboardCheck className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Visits Completed</p>
                <p className="text-2xl font-bold">{completedVisits} / {totalVisits}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upcoming Visits */}
      <Card>
        <CardHeader><CardTitle className="text-base">Upcoming Service Visits</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : upcomingVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No upcoming visits scheduled</p>
          ) : (
            <div className="space-y-2">
              {upcomingVisits.map((v) => (
                <Link key={v.id} to={`/client/visits/${v.id}`} className="flex items-center justify-between text-sm py-2 px-3 border rounded-md hover:bg-muted/50 transition-colors">
                  <div>
                    <span className="font-medium">{v.period_label || v.scheduled_date}</span>
                    <span className="text-muted-foreground ml-2">— {(v as any).properties?.name}</span>
                  </div>
                  <Badge variant={statusColor(v.status) as any}>{v.status.replace(/_/g, " ")}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Properties */}
      <div>
        <h2 className="text-lg font-semibold mb-4">My Properties</h2>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => (
              <Link key={p.id} to={`/client/properties/${p.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{p.name}</p>
                        <p className="text-sm text-muted-foreground">{[p.address, p.city].filter(Boolean).join(", ")}</p>
                        <Badge variant={p.status === "active" ? "default" : "secondary"} className="mt-2">{p.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {properties.length === 0 && (
              <p className="text-muted-foreground col-span-full text-center py-8">No properties yet. Click "Add Property" to get started.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
