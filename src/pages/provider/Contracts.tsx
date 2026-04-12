import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, ArrowUpDown, ArrowUp, ArrowDown, Download, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT_TO_CLIENT: "outline",
  SIGNED: "default",
  ACTIVE: "default",
  CLOSED: "destructive",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SENT_TO_CLIENT: "Sent to Client",
  SIGNED: "Signed",
  ACTIVE: "Active",
  CLOSED: "Closed",
};

const billingLabels: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ONE_TIME: "Ad hoc",
};

type FilterTab = "ALL" | "ACTIVE" | "INACTIVE";
type SortKey = "customer" | "property" | "contract" | "start_date" | "end_date" | "status" | "total" | "visit_freq" | "billing";
type SortDir = "asc" | "desc";

const ACTIVE_STATUSES = ["ACTIVE", "SIGNED", "SENT_TO_CLIENT"];
const INACTIVE_STATUSES = ["CLOSED", "DRAFT"];

export default function Contracts({ embedded }: { embedded?: boolean } = {}) {
  const currency = useTenantCurrency();
  const [contracts, setContracts] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [lineItemTotals, setLineItemTotals] = useState<Map<string, number>>(new Map());
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [billingCycle, setBillingCycle] = useState<"WEEKLY" | "MONTHLY" | "ONE_TIME">("MONTHLY");
  const [visitCount, setVisitCount] = useState(1);
  const [visitType, setVisitType] = useState("WEEK");
  const [sortKey, setSortKey] = useState<SortKey>("start_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [services, setServices] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const [contractRes, propRes, lineItemRes, svcRes] = await Promise.all([
      supabase
        .from("contracts")
        .select("*, properties(name, customers(name))")
        .order("start_date", { ascending: false }),
      supabase.from("properties").select("id, name, address, customers(name)").order("name"),
      supabase
        .from("contract_line_items")
        .select("contract_id, quantity, service_catalog(default_price)"),
      supabase.from("service_catalog").select("*").eq("is_active", true).order("code").order("name"),
    ]);
    setContracts(contractRes.data ?? []);
    setProperties(propRes.data ?? []);
    setServices(svcRes.data ?? []);

    const totals = new Map<string, number>();
    for (const item of lineItemRes.data ?? []) {
      const price = (item.service_catalog as any)?.default_price ?? 0;
      const current = totals.get(item.contract_id) ?? 0;
      totals.set(item.contract_id, current + (item.quantity * price));
    }
    setLineItemTotals(totals);
  };

  const toggleProperty = (id: string) => {
    setSelectedPropertyIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const categories = [...new Set(services.map((s) => s.code as string))].sort();
  const filteredServices = services.filter((s) => s.code === selectedCategory);

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const startDate = form.get("start_date") as string;
    const endDate = form.get("end_date") as string;
    const contractName = form.get("name") as string;

    if (selectedPropertyIds.length === 0) { toast.error("Select at least one property"); return; }
    if (!startDate || !endDate) { toast.error("Start and end dates are required"); return; }
    if (selectedServiceIds.length === 0) { toast.error("Select at least one service"); return; }

    // Check inventory exists for all selected properties
    const { data: inventories } = await supabase
      .from("inventory")
      .select("property_id, inventory_items(id)")
      .in("property_id", selectedPropertyIds);
    const propsWithInventory = new Set(
      (inventories ?? []).filter((inv: any) => inv.inventory_items?.length > 0).map((inv: any) => inv.property_id)
    );
    const missingProps = selectedPropertyIds.filter(id => !propsWithInventory.has(id));
    if (missingProps.length > 0) {
      const names = missingProps.map(id => properties.find((p: any) => p.id === id)?.name || "Unknown").join(", ");
      toast.error(`Cannot create contract: property "${names}" has no inventory. Add inventory items first (lawn size, tree count, etc.).`);
      return;
    }

    const inserts = selectedPropertyIds.map((propertyId) => ({
      contract_name: contractName,
      property_id: propertyId,
      start_date: startDate,
      end_date: endDate,
      billing_cycle: billingCycle,
      visit_frequency_count: visitCount,
      visit_frequency_type: visitType,
      status: "DRAFT" as const,
    } as any));

    const { data: created, error } = await supabase.from("contracts").insert(inserts).select("id");
    if (error) { toast.error(error.message); return; }

    // Insert contract line items for each created contract
    const lineItems = (created ?? []).flatMap((contract) =>
      selectedServiceIds.map((serviceId) => ({
        contract_id: contract.id,
        service_catalog_id: serviceId,
        quantity: 1,
        frequency_type: "PER_VISIT" as const,
      }))
    );
    if (lineItems.length > 0) {
      const { error: liError } = await supabase.from("contract_line_items").insert(lineItems);
      if (liError) { toast.error("Contract created but failed to add service lines: " + liError.message); }
    }

    toast.success(`${inserts.length} contract(s) created`);
    setOpen(false);
    setSelectedPropertyIds([]);
    setSelectedServiceIds([]);
    setSelectedCategory("");
    setBillingCycle("MONTHLY");
    setVisitCount(1);
    setVisitType("WEEK");
    load();
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const getVal = (c: any, key: SortKey): string | number => {
    switch (key) {
      case "customer": return ((c.properties as any)?.customers?.name || "").toLowerCase();
      case "property": return ((c.properties as any)?.name || "").toLowerCase();
      case "contract": return c.contract_name.toLowerCase();
      case "start_date": return c.start_date || "";
      case "end_date": return c.end_date || "9999";
      case "status": return c.status;
      case "total": return lineItemTotals.get(c.id) ?? 0;
      case "visit_freq": return (c.visit_frequency_count ?? 0);
      case "billing": return c.billing_cycle;
      default: return "";
    }
  };

  const filtered = useMemo(() => {
    let list = contracts.filter(c => {
      // Tab filter
      if (filterTab === "ACTIVE" && !ACTIVE_STATUSES.includes(c.status)) return false;
      if (filterTab === "INACTIVE" && !INACTIVE_STATUSES.includes(c.status)) return false;
      // Specific status filter
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      // Search
      const q = search.toLowerCase();
      if (!q) return true;
      return c.contract_name.toLowerCase().includes(q) ||
        (c.properties as any)?.name?.toLowerCase().includes(q) ||
        (c.properties as any)?.customers?.name?.toLowerCase().includes(q);
    });

    // Sort
    list.sort((a, b) => {
      const aVal = getVal(a, sortKey);
      const bVal = getVal(b, sortKey);
      const cmp = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [contracts, filterTab, statusFilter, search, sortKey, sortDir, lineItemTotals]);

  // Stats
  const activeCount = contracts.filter(c => ACTIVE_STATUSES.includes(c.status)).length;
  const inactiveCount = contracts.filter(c => INACTIVE_STATUSES.includes(c.status)).length;

  const handleExportCSV = () => {
    const headers = ["Customer", "Property", "Contract", "Start Date", "End Date", "Status", "Total Value", "Visit Frequency", "Billing Frequency"];
    const rows = filtered.map(c => {
      const customerName = (c.properties as any)?.customers?.name || "";
      const propertyName = (c.properties as any)?.name || "";
      const totalValue = lineItemTotals.get(c.id);
      const visitFreq = c.visit_frequency_count && c.visit_frequency_type
        ? `${c.visit_frequency_count}x / ${c.visit_frequency_type.toLowerCase()}`
        : "";
      return [
        customerName,
        propertyName,
        c.contract_name,
        c.start_date,
        c.end_date || "",
        statusLabels[c.status] || c.status,
        totalValue != null ? totalValue.toFixed(2) : "",
        visitFreq,
        billingLabels[c.billing_cycle] || c.billing_cycle,
      ].map(v => `"${v}"`).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contracts-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      {!embedded && (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contracts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contracts.length} total · {activeCount} active · {inactiveCount} inactive
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSelectedPropertyIds([]); setSelectedServiceIds([]); setSelectedCategory(""); setBillingCycle("MONTHLY"); } }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Contract</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>New Contract</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2"><Label>Contract Name *</Label><Input name="name" required placeholder="e.g. Annual Maintenance 2026" /></div>
                <div className="space-y-2">
                  <Label>Properties *</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                    {properties.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No properties available.</p>
                    ) : (
                      properties.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`cprop-${p.id}`}
                            checked={selectedPropertyIds.includes(p.id)}
                            onCheckedChange={() => toggleProperty(p.id)}
                          />
                          <label htmlFor={`cprop-${p.id}`} className="text-sm cursor-pointer flex-1">
                            {(p.customers as any)?.name} — {p.name}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                  {selectedPropertyIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{selectedPropertyIds.length} selected</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Start Date *</Label><Input name="start_date" type="date" required /></div>
                  <div className="space-y-2"><Label>End Date *</Label><Input name="end_date" type="date" required /></div>
                </div>

                {/* Service Selection */}
                <div className="space-y-2">
                  <Label>Services *</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedCategory && filteredServices.length > 0 && (
                    <div className="border rounded-md p-3 space-y-2 max-h-36 overflow-y-auto">
                      {filteredServices.map((svc) => (
                        <div key={svc.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`csvc-${svc.id}`}
                            checked={selectedServiceIds.includes(svc.id)}
                            onCheckedChange={() => toggleService(svc.id)}
                          />
                          <label htmlFor={`csvc-${svc.id}`} className="text-sm cursor-pointer flex-1">
                            {svc.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedServiceIds.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{selectedServiceIds.length} service(s) selected:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedServiceIds.map((id) => {
                          const svc = services.find((s) => s.id === id);
                          return svc ? (
                            <Badge key={id} variant="secondary" className="text-xs gap-1">
                              {svc.name}
                              <button type="button" onClick={() => toggleService(id)} className="hover:text-destructive">
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Visit Frequency</Label>
                  <div className="flex gap-2">
                    <Select value={String(visitCount)} onValueChange={(v) => setVisitCount(Number(v))}>
                      <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={visitType} onValueChange={setVisitType}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEEK">per Week</SelectItem>
                        <SelectItem value="MONTH">per Month</SelectItem>
                        <SelectItem value="YEAR">per Year</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Billing Frequency</Label>
                  <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="ONE_TIME">Ad hoc</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Create Contract</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {([
            { key: "ALL" as FilterTab, label: "All", count: contracts.length },
            { key: "ACTIVE" as FilterTab, label: "Active", count: activeCount },
            { key: "INACTIVE" as FilterTab, label: "Inactive", count: inactiveCount },
          ]).map(tab => (
            <Button
              key={tab.key}
              variant={filterTab === tab.key ? "default" : "ghost"}
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => { setFilterTab(tab.key); setStatusFilter("ALL"); }}
            >
              {tab.label}
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-background/50">
                {tab.count}
              </Badge>
            </Button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by customer, property, or contract…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SENT_TO_CLIENT">Sent to Client</SelectItem>
            <SelectItem value="SIGNED">Signed</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {filtered.length} of {contracts.length} contracts</span>
        {search && <button className="underline hover:text-foreground" onClick={() => setSearch("")}>Clear search</button>}
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {([
                { key: "customer" as SortKey, label: "Customer" },
                { key: "property" as SortKey, label: "Property" },
                { key: "contract" as SortKey, label: "Contract" },
                { key: "start_date" as SortKey, label: "Start Date" },
                { key: "end_date" as SortKey, label: "End Date" },
                { key: "status" as SortKey, label: "Status" },
              ]).map(col => (
                <TableHead key={col.key}>
                  <button
                    className="flex items-center gap-0.5 hover:text-foreground transition-colors font-medium"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon col={col.key} />
                  </button>
                </TableHead>
              ))}
              <TableHead>
                <button
                  className="flex items-center gap-0.5 hover:text-foreground transition-colors font-medium ml-auto"
                  onClick={() => handleSort("total")}
                >
                  Total Value
                  <SortIcon col="total" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-0.5 hover:text-foreground transition-colors font-medium"
                  onClick={() => handleSort("visit_freq")}
                >
                  Visit Freq.
                  <SortIcon col="visit_freq" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  className="flex items-center gap-0.5 hover:text-foreground transition-colors font-medium"
                  onClick={() => handleSort("billing")}
                >
                  Billing Freq.
                  <SortIcon col="billing" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const customerName = (c.properties as any)?.customers?.name || "—";
              const propertyName = (c.properties as any)?.name || "—";
              const totalValue = lineItemTotals.get(c.id);

              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="font-medium">{customerName}</TableCell>
                  <TableCell>{propertyName}</TableCell>
                  <TableCell>
                    <Link to={`/provider/contracts/${c.id}`} className="text-primary hover:underline">
                      {c.contract_name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{format(new Date(c.start_date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="tabular-nums">{c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[c.status] || "secondary"} className="text-[10px]">
                      {statusLabels[c.status] || c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {totalValue != null ? formatCurrency(totalValue, currency) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.visit_frequency_count && c.visit_frequency_type
                      ? `${c.visit_frequency_count}x / ${c.visit_frequency_type.toLowerCase()}`
                      : "—"}
                  </TableCell>
                  <TableCell>{billingLabels[c.billing_cycle] || c.billing_cycle}</TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No contracts found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
