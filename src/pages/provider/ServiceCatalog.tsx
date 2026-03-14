import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

type SortField = 'code' | 'name' | 'default_unit' | 'default_price' | 'is_active';
type SortDirection = 'asc' | 'desc';

export default function ServiceCatalog() {
  const [services, setServices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // For the new service form
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [newCategory, setNewCategory] = useState("");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase.from("service_catalog").select("*").order("code");
    setServices(data ?? []);
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    services.forEach(s => {
      const codePart = s.code.split('-')[0];
      if (codePart) cats.add(codePart);
    });
    return Array.from(cats).sort();
  }, [services]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);

    // Determine the actual code/category to use
    let finalCode = "";
    if (editing) {
      finalCode = form.get("code") as string;
    } else {
      const cat = isAddingNewCategory ? newCategory : selectedCategory;
      if (!cat) {
        toast.error("Please select or enter a category");
        return;
      }
      // Generate a new code like LAN-006 based on existing
      const existingInCategory = services.filter(s => s.code.startsWith(cat + '-'));
      let nextNum = 1;
      if (existingInCategory.length > 0) {
        const maxNum = Math.max(...existingInCategory.map(s => {
          const parts = s.code.split('-');
          return parts.length > 1 ? parseInt(parts[1]) || 0 : 0;
        }));
        nextNum = maxNum + 1;
      }
      finalCode = `${cat.toUpperCase()}-${nextNum.toString().padStart(3, '0')}`;
    }

    const payload = {
      code: finalCode,
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedServices = useMemo(() => {
    let result = [...services];

    // Filtering
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(s => {
        const category = s.code.split('-')[0] || s.code;
        return (
          s.code.toLowerCase().includes(term) ||
          category.toLowerCase().includes(term) ||
          s.name.toLowerCase().includes(term) ||
          (s.description || "").toLowerCase().includes(term)
        );
      });
    }

    // Sorting
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'code') {
        // Sort by category first, then number if possible
        valA = a.code.split('-')[0];
        valB = b.code.split('-')[0];
        if (valA === valB) {
          return sortDirection === 'asc' ? a.code.localeCompare(b.code) : b.code.localeCompare(a.code);
        }
      }

      if (typeof valA === 'string') {
        return sortDirection === 'asc'
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA);
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [services, searchTerm, sortField, sortDirection]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Service Catalog</h1>
        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search services..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) {
              setEditing(null);
              setIsAddingNewCategory(false);
              setNewCategory("");
              setSelectedCategory("");
            }
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Service</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Service</DialogTitle></DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {editing ? (
                    <div className="space-y-2">
                      <Label>Code (Category) *</Label>
                      <Input name="code" required defaultValue={editing?.code} readOnly className="bg-muted" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Category *</Label>
                      {isAddingNewCategory ? (
                        <div className="flex gap-2">
                          <Input
                            value={newCategory}
                            onChange={e => setNewCategory(e.target.value.toUpperCase())}
                            placeholder="e.g. MNT"
                            maxLength={4}
                            required
                          />
                          <Button type="button" variant="ghost" onClick={() => setIsAddingNewCategory(false)}>Cancel</Button>
                        </div>
                      ) : (
                        <Select value={selectedCategory} onValueChange={(v) => {
                          if (v === 'NEW') setIsAddingNewCategory(true);
                          else setSelectedCategory(v);
                        }} required>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                            <SelectItem value="NEW" className="font-bold text-primary">
                              <Plus className="h-4 w-4 inline mr-1" /> New Category
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  <div className="space-y-2"><Label>Service Name *</Label><Input name="name" required defaultValue={editing?.name} /></div>
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
      </div>

      <div className="rounded-lg border overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead onClick={() => handleSort('code')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">Category {sortField === 'code' && <ArrowUpDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">Service Name {sortField === 'name' && <ArrowUpDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead onClick={() => handleSort('default_unit')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">Unit {sortField === 'default_unit' && <ArrowUpDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead onClick={() => handleSort('default_price')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">Price {sortField === 'default_price' && <ArrowUpDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead onClick={() => handleSort('is_active')} className="cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">Status {sortField === 'is_active' && <ArrowUpDown className="h-3 w-3" />}</div>
              </TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedServices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No services found matching your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedServices.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-primary">{s.code.split('-')[0]}</span>
                      <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {s.name}
                    {s.description && (
                      <p className="text-xs text-muted-foreground font-normal line-clamp-1 mt-0.5">{s.description}</p>
                    )}
                  </TableCell>
                  <TableCell>{s.default_unit}</TableCell>
                  <TableCell>{s.default_price != null ? `$${s.default_price.toFixed(2)}` : "—"}</TableCell>
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
    </div>
  );
}
