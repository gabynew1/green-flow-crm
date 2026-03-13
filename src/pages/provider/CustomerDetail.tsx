import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, MapPin } from "lucide-react";
import { toast } from "sonner";

export default function CustomerDetail() {
  const { customerId } = useParams();
  const [customer, setCustomer] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [propOpen, setPropOpen] = useState(false);

  useEffect(() => { load(); }, [customerId]);

  const load = async () => {
    const { data: c } = await supabase.from("customers").select("*").eq("id", customerId!).single();
    setCustomer(c);
    const { data: p } = await supabase.from("properties").select("*").eq("customer_id", customerId!).order("name");
    setProperties(p ?? []);
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

  if (!customer) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/customers">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">{customer.name}</h1>
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
