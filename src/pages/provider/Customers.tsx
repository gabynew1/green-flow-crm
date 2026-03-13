import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Building2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function Customers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

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
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Customer created!");
    setOpen(false);
    loadCustomers();
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
