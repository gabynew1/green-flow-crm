import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trees, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

const CATEGORIES = ["TREE", "LAWN", "SHRUB", "FLOWER_BED", "HEDGE", "IRRIGATION", "PAVING", "PLANTER", "LIGHTING", "FENCE", "OTHER"] as const;

const UNITS = ["count", "m²", "linear_m", "hectare", "zone", "unit", "lot"] as const;

interface InventoryTabProps {
  propertyId: string;
}

export function InventoryTab({ propertyId }: InventoryTabProps) {
  const [inventory, setInventory] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => { load(); }, [propertyId]);

  const load = async () => {
    const { data: inv } = await supabase.from("inventory").select("*").eq("property_id", propertyId).single();
    setInventory(inv);
    if (inv) {
      const { data: itms } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("inventory_id", inv.id)
        .order("category");
      setItems(itms ?? []);
    }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inventory) return;
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("inventory_items").insert([{
      inventory_id: inventory.id,
      tenant_id: inventory.tenant_id,
      category: form.get("category") as any,
      name: form.get("name") as string,
      quantity: Number(form.get("quantity")) || 1,
      unit: form.get("unit") as string || "count",
      notes: form.get("notes") as string,
      source: "MANUAL" as const,
    }]);
    if (error) { toast.error(error.message); return; }
    toast.success("Item added!");
    setAddOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("inventory_items").delete().eq("id", id);
    load();
  };

  const categoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      TREE: "bg-primary/10 text-primary border-primary/20",
      LAWN: "bg-green-500/10 text-green-600 border-green-500/20",
      SHRUB: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      FLOWER_BED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
      HEDGE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      IRRIGATION: "bg-blue-500/10 text-blue-600 border-blue-500/20",
      PAVING: "bg-stone-500/10 text-stone-600 border-stone-500/20",
      PLANTER: "bg-violet-500/10 text-violet-600 border-violet-500/20",
      LIGHTING: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      FENCE: "bg-orange-500/10 text-orange-600 border-orange-500/20",
      OTHER: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    };
    return colors[cat] || colors.OTHER;
  };

  const getHealthBadge = (updatedAt: string) => {
    const daysSinceUpdate = differenceInDays(new Date(), new Date(updatedAt));
    if (daysSinceUpdate < 30) return <Badge className="bg-green-500/10 text-green-600 border-green-500/20" variant="outline">Healthy</Badge>;
    if (daysSinceUpdate < 90) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20" variant="outline">Stable</Badge>;
    return <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20" variant="outline">Attention</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Trees className="h-4 w-4" /> Green Inventory</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select name="category" defaultValue="OTHER">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Name *</Label><Input name="name" required placeholder="e.g. Oak tree, Front lawn" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Quantity</Label><Input name="quantity" type="number" defaultValue="1" /></div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select name="unit" defaultValue="count">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Notes</Label><Input name="notes" /></div>
              <Button type="submit" className="w-full">Add Item</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No inventory items yet. Add items manually or use the AI assistant.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Last Check</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <Badge className={categoryColor(item.category)} variant="secondary">
                      {item.category.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{item.name}</span>
                      {item.notes && <span className="text-[10px] text-muted-foreground line-clamp-1">{item.notes}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.quantity} <span className="text-[10px] text-muted-foreground">{item.unit}</span>
                  </TableCell>
                  <TableCell>{getHealthBadge(item.updated_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(item.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
