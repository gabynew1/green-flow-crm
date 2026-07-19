import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trees, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useInventoryCategoryTranslator } from "@/hooks/useCatalogTranslation";

const CATEGORIES = ["TREE", "LAWN", "SHRUB", "FLOWER_BED", "HEDGE", "IRRIGATION", "PAVING", "PLANTER", "LIGHTING", "FENCE", "OTHER"] as const;

const UNITS = ["count", "m²", "linear_m", "hectare", "zone", "unit", "lot"] as const;

interface InventoryTabProps {
  propertyId: string;
}

export function InventoryTab({ propertyId }: InventoryTabProps) {
  const [inventory, setInventory] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; category: string; quantity: string; unit: string; notes: string }>({
    name: "", category: "OTHER", quantity: "1", unit: "count", notes: "",
  });
  const { t } = useTranslation("provider");
  const tCategory = useInventoryCategoryTranslator();

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
    toast.success(t("inventory.added"));
    setAddOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("inventory_items").delete().eq("id", id);
    load();
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name ?? "",
      category: item.category ?? "OTHER",
      quantity: String(item.quantity ?? 1),
      unit: item.unit ?? "count",
      notes: item.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editForm.name.trim()) { toast.error("Name is required"); return; }
    const { error } = await supabase.from("inventory_items").update({
      name: editForm.name.trim(),
      category: editForm.category as any,
      quantity: Number(editForm.quantity) || 1,
      unit: editForm.unit || "count",
      notes: editForm.notes || null,
    } as any).eq("id", editingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Updated");
    setEditingId(null);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Trees className="h-4 w-4" /> {t("inventory.title")}</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> {t("inventory.addItem")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("inventory.addItem")}</DialogTitle></DialogHeader>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("inventory.category")}</Label>
                <Select name="category" defaultValue="OTHER">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{tCategory(c)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t("inventory.name")} *</Label><Input name="name" required placeholder="e.g. Oak tree, Front lawn" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>{t("inventory.quantity")}</Label><Input name="quantity" type="number" defaultValue="1" /></div>
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
              <Button type="submit" className="w-full">{t("inventory.addItem")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("inventory.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t("inventory.category")}</TableHead>
                <TableHead>{t("inventory.name")}</TableHead>
                <TableHead>{t("inventory.quantity")}</TableHead>
                <TableHead>{t("inventory.lastCheck")}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => {
                const isEditing = editingId === item.id;
                const catLabel = tCategory(item.category);
                const nameEqualsCategory = (item.name ?? "").trim().toLowerCase() === catLabel.trim().toLowerCase();
                if (isEditing) {
                  return (
                    <TableRow key={item.id} className="bg-muted/30">
                      <TableCell>
                        <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v })}>
                          <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{tCategory(c)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        <Input className="h-7 text-xs mt-1" placeholder="Notes" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Input className="h-8 w-16 text-sm" type="number" value={editForm.quantity} onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })} />
                          <Select value={editForm.unit} onValueChange={(v) => setEditForm({ ...editForm, unit: v })}>
                            <SelectTrigger className="h-8 text-xs w-[80px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(item.updated_at), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={saveEdit}><Check className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Badge className={categoryColor(item.category)} variant="secondary">
                        {catLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        {!nameEqualsCategory && <span className="font-medium">{item.name}</span>}
                        {item.notes && <span className="text-[10px] text-muted-foreground line-clamp-1">{item.notes}</span>}
                        {nameEqualsCategory && !item.notes && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.quantity} <span className="text-[10px] text-muted-foreground">{item.unit}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(item.updated_at), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => startEdit(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
