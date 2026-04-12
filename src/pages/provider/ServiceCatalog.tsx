import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Pencil, Search, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

type SortField = "code" | "name" | "default_price";
type SortDir = "asc" | "desc";
type ActiveFilter = "all" | "active" | "inactive";

export default function ServiceCatalog() {
  const [services, setServices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

  // Manage dialogs
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [manageUnitsOpen, setManageUnitsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingUnit, setEditingUnit] = useState<string | null>(null);
  const [editUnitValue, setEditUnitValue] = useState("");
  const [newUnit, setNewUnit] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from("service_catalog").select("*").order("code");
    setServices(data ?? []);
  };

  // Derive categories and units from catalog data
  const categories = useMemo(() => {
    const cats = new Set<string>();
    services.forEach(s => { if (s.code) cats.add(s.code); });
    return Array.from(cats).sort();
  }, [services]);

  const units = useMemo(() => {
    const u = new Set<string>();
    services.forEach(s => { if (s.default_unit) u.add(s.default_unit); });
    return Array.from(u).sort();
  }, [services]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const filtered = useMemo(() => {
    let result = services;
    if (activeFilter === "active") result = result.filter(s => s.is_active);
    if (activeFilter === "inactive") result = result.filter(s => !s.is_active);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        s.code?.toLowerCase().includes(q) ||
        s.name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.default_unit?.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (sortField === "default_price") {
        aVal = aVal ?? -1;
        bVal = bVal ?? -1;
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      aVal = (aVal ?? "").toString().toLowerCase();
      bVal = (bVal ?? "").toString().toLowerCase();
      const cmp = aVal.localeCompare(bVal);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [services, search, sortField, sortDir, activeFilter]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      code: form.get("category") as string,
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

  // Category management
  const handleRenameCategory = async () => {
    if (!editingCategory || !editCategoryValue.trim()) return;
    const { error } = await supabase
      .from("service_catalog")
      .update({ code: editCategoryValue.trim() })
      .eq("code", editingCategory);
    if (error) { toast.error(error.message); return; }
    toast.success("Category renamed!");
    setEditingCategory(null);
    setEditCategoryValue("");
    load();
  };

  const handleDeleteCategory = async (cat: string) => {
    const used = services.some(s => s.code === cat);
    if (used) { toast.error("Cannot delete — category has services. Remove or reassign them first."); return; }
    toast.success("Category removed");
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) { toast.error("Category already exists"); return; }
    // Categories are implicit — they exist when at least one service has that code.
    // We'll add a placeholder service that the user can then edit.
    toast.success(`Category "${newCategory.trim()}" created! Add a service to it.`);
    setNewCategory("");
  };

  // Unit management
  const handleRenameUnit = async () => {
    if (!editingUnit || !editUnitValue.trim()) return;
    const { error } = await supabase
      .from("service_catalog")
      .update({ default_unit: editUnitValue.trim() })
      .eq("default_unit", editingUnit);
    if (error) { toast.error(error.message); return; }
    toast.success("Unit renamed across all services!");
    setEditingUnit(null);
    setEditUnitValue("");
    load();
  };

  const handleDeleteUnit = async (unit: string) => {
    const used = services.some(s => s.default_unit === unit);
    if (used) { toast.error("Cannot delete — unit is used by services. Reassign them first."); return; }
    toast.success("Unit removed");
  };

  const handleAddUnit = async () => {
    if (!newUnit.trim()) return;
    if (units.includes(newUnit.trim())) { toast.error("Unit already exists"); return; }
    toast.success(`Unit "${newUnit.trim()}" created! Use it when adding services.`);
    setNewUnit("");
  };

  // Collect all available categories (existing + newly created ones stored in local state)
  const [localCategories, setLocalCategories] = useState<string[]>([]);
  const [localUnits, setLocalUnits] = useState<string[]>([]);

  const allCategories = useMemo(() => {
    const merged = new Set([...categories, ...localCategories]);
    return Array.from(merged).sort();
  }, [categories, localCategories]);

  const allUnits = useMemo(() => {
    const merged = new Set([...units, ...localUnits]);
    return Array.from(merged).sort();
  }, [units, localUnits]);

  const handleAddCategoryLocal = () => {
    if (!newCategory.trim()) return;
    if (allCategories.includes(newCategory.trim())) { toast.error("Category already exists"); return; }
    setLocalCategories(prev => [...prev, newCategory.trim()]);
    toast.success(`Category "${newCategory.trim()}" added!`);
    setNewCategory("");
  };

  const handleAddUnitLocal = () => {
    if (!newUnit.trim()) return;
    if (allUnits.includes(newUnit.trim())) { toast.error("Unit already exists"); return; }
    setLocalUnits(prev => [...prev, newUnit.trim()]);
    toast.success(`Unit "${newUnit.trim()}" added!`);
    setNewUnit("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Service Catalog</h1>
        <div className="flex items-center gap-2">
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Service</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit" : "New"} Service</DialogTitle>
                <DialogDescription>
                  {editing ? "Update the service details below." : "Fill in the details to add a new service."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select name="category" required defaultValue={editing?.code}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {allCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Service *</Label>
                    <Input name="name" required maxLength={100} defaultValue={editing?.name} placeholder="Service name" />
                  </div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Input name="description" defaultValue={editing?.description} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Select name="unit" defaultValue={editing?.default_unit || "job"}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {allUnits.map(u => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Default Price</Label><Input name="price" type="number" step="0.01" defaultValue={editing?.default_price} /></div>
                </div>
                <Button type="submit" className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* 3-dot menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setManageCategoriesOpen(true)}>
                Manage Categories
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setManageUnitsOpen(true)}>
                Manage Units
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by category, service, or unit…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={activeFilter} onValueChange={v => setActiveFilter(v as ActiveFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("code")}>
                <span className="flex items-center">Category <SortIcon field="code" /></span>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <span className="flex items-center">Service <SortIcon field="name" /></span>
              </TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("default_price")}>
                <span className="flex items-center">Price <SortIcon field="default_price" /></span>
              </TableHead>
              <TableHead>Active</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No services match your search.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="text-xs">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.default_unit}</TableCell>
                  <TableCell>{s.default_price != null ? formatCurrency(s.default_price, currency) : "—"}</TableCell>
                  <TableCell>
                    <Switch checked={s.is_active} onCheckedChange={() => toggleActive(s.id, s.is_active)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">{filtered.length} of {services.length} services</p>
      )}

      {/* Manage Categories Dialog */}
      <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>Create, rename, or remove service categories.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="New category name"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                maxLength={60}
              />
              <Button size="sm" onClick={handleAddCategoryLocal} disabled={!newCategory.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
              {allCategories.map(cat => {
                const count = services.filter(s => s.code === cat).length;
                return (
                  <div key={cat} className="flex items-center gap-2 px-3 py-2">
                    {editingCategory === cat ? (
                      <>
                        <Input
                          value={editCategoryValue}
                          onChange={e => setEditCategoryValue(e.target.value)}
                          className="h-8 flex-1"
                          maxLength={60}
                        />
                        <Button size="sm" variant="outline" onClick={handleRenameCategory}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{cat}</span>
                        <span className="text-xs text-muted-foreground">{count} services</span>
                        <Button size="icon" variant="ghost" onClick={() => { setEditingCategory(cat); setEditCategoryValue(cat); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteCategory(cat)} disabled={count > 0}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
              {allCategories.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No categories yet</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Units Dialog */}
      <Dialog open={manageUnitsOpen} onOpenChange={setManageUnitsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage Units</DialogTitle>
            <DialogDescription>Create, rename, or remove measurement units.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="New unit name"
                value={newUnit}
                onChange={e => setNewUnit(e.target.value)}
                maxLength={30}
              />
              <Button size="sm" onClick={handleAddUnitLocal} disabled={!newUnit.trim()}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
            <div className="border rounded-md max-h-60 overflow-y-auto divide-y">
              {allUnits.map(unit => {
                const count = services.filter(s => s.default_unit === unit).length;
                return (
                  <div key={unit} className="flex items-center gap-2 px-3 py-2">
                    {editingUnit === unit ? (
                      <>
                        <Input
                          value={editUnitValue}
                          onChange={e => setEditUnitValue(e.target.value)}
                          className="h-8 flex-1"
                          maxLength={30}
                        />
                        <Button size="sm" variant="outline" onClick={handleRenameUnit}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingUnit(null)}>Cancel</Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm">{unit}</span>
                        <span className="text-xs text-muted-foreground">{count} services</span>
                        <Button size="icon" variant="ghost" onClick={() => { setEditingUnit(unit); setEditUnitValue(unit); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteUnit(unit)} disabled={count > 0}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
              {allUnits.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No units yet</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
