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

const CATEGORIES = ["TREE", "LAWN", "SHRUB", "FLOWER_BED", "OTHER"] as const;

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
      category: form.get("category") as "TREE" | "LAWN" | "SHRUB" | "FLOWER_BED" | "OTHER",
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
      TREE: "bg-primary/10 text-primary",
      LAWN: "bg-success/10 text-success",
      SHRUB: "bg-info/10 text-info",
      FLOWER_BED: "bg-accent/10 text-accent-foreground",
      OTHER: "bg-muted text-muted-foreground",
    };
    return colors[cat] || colors.OTHER;
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
                <div className="space-y-2"><Label>Unit</Label><Input name="unit" defaultValue="count" placeholder="count, m², linear_meters" /></div>
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
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Source</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <TableRow key={item.id}>
                  <TableCell><Badge className={categoryColor(item.category)} variant="secondary">{item.category.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{item.source}</Badge></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
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
