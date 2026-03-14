import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function ServiceCatalog() {
  const [services, setServices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from("service_catalog").select("*").order("code");
    setServices(data ?? []);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      code: form.get("code") as string,
      name: form.get("name") as string,
      description: form.get("description") as string,
      default_unit: form.get("unit") as string,
      default_price: Number(form.get("price")) || null,
      is_active: true,
    };

    if (editing) {
      const { error } = await supabase.from("service_catalog").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Service updated!");
    } else {
      const { error } = await supabase.from("service_catalog").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Service added!");
    }
    setOpen(false);
    setEditing(null);
    load();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await supabase.from("service_catalog").update({ is_active: !current }).eq("id", id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Service Catalog</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Service</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Service</DialogTitle></DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Code *</Label><Input name="code" required defaultValue={editing?.code} /></div>
                <div className="space-y-2"><Label>Name *</Label><Input name="name" required defaultValue={editing?.name} /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input name="description" defaultValue={editing?.description} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Default Unit</Label><Input name="unit" defaultValue={editing?.default_unit || "visit"} /></div>
                <div className="space-y-2"><Label>Default Price</Label><Input name="price" type="number" step="0.01" defaultValue={editing?.default_price} /></div>
              </div>
              <Button type="submit" className="w-full">Save</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs">{s.code}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.default_unit}</TableCell>
                <TableCell>{s.default_price != null ? `$${s.default_price}` : "—"}</TableCell>
                <TableCell>
                  <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s.id, s.is_active)} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
