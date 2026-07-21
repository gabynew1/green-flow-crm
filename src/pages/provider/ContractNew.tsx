import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2, X, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

type FrequencyType = "PER_VISIT" | "PER_WEEK" | "PER_MONTH" | "PER_YEAR" | "PER_CONTRACT" | "ONE_TIME";

interface ServiceCfg {
  frequency_type: FrequencyType;
  quantity: number;
  unit_price: string;
  max_occurrences: string;
}

const defaultCfg = (defaultPrice?: number | null): ServiceCfg => ({
  frequency_type: "PER_VISIT",
  quantity: 1,
  unit_price: defaultPrice != null ? String(defaultPrice) : "",
  max_occurrences: "",
});

export default function ContractNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const presetCustomerId = params.get("customerId") ?? "";
  const { profile } = useAuth();
  const currency = useTenantCurrency();

  const [customers, setCustomers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState(presetCustomerId);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "YEARLY" | "ONE_TIME">("MONTHLY");
  const [visitCount, setVisitCount] = useState(1);
  const [visitType, setVisitType] = useState("WEEK");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [serviceConfig, setServiceConfig] = useState<Record<string, ServiceCfg>>({});
  const [serviceSearch, setServiceSearch] = useState("");
  const [flatFee, setFlatFee] = useState("");

  const isFlatFeeMode = selectedCategory === "Regular Maintenance";

  // Preset derived from the contract's visit frequency — every auto-added
  // included service inherits this allowance so nothing defaults to Unlimited.
  const allowancePreset = useMemo(() => {
    const frequency_type: FrequencyType =
      visitType === "WEEK" ? "PER_WEEK"
      : visitType === "MONTH" ? "PER_MONTH"
      : visitType === "YEAR" ? "PER_YEAR"
      : "PER_MONTH";
    return { frequency_type, max: Math.max(1, Number(visitCount) || 1) };
  }, [visitType, visitCount]);

  // Track services the user hand-edited so re-syncing the preset does not
  // clobber their choices.
  const [overriddenServiceIds, setOverriddenServiceIds] = useState<Set<string>>(new Set());

  // Reset flat fee whenever category changes
  useEffect(() => {
    setFlatFee("");
  }, [selectedCategory]);

  // In flat-fee mode, auto-include all services of that category
  useEffect(() => {
    if (!isFlatFeeMode) return;
    const catIds = services.filter((s) => s.code === selectedCategory).map((s) => s.id);
    if (catIds.length === 0) return;
    setSelectedServiceIds(catIds);
    setServiceConfig((cfg) => {
      const next = { ...cfg };
      for (const id of catIds) {
        if (!next[id]) {
          next[id] = {
            ...defaultCfg(),
            frequency_type: allowancePreset.frequency_type,
            max_occurrences: String(allowancePreset.max),
          };
        }
      }
      return next;
    });
  }, [isFlatFeeMode, selectedCategory, services, allowancePreset]);

  // Re-sync preset when visit frequency changes; skip user-edited rows.
  useEffect(() => {
    if (!isFlatFeeMode) return;
    setServiceConfig((cfg) => {
      let changed = false;
      const next = { ...cfg };
      for (const id of Object.keys(next)) {
        if (overriddenServiceIds.has(id)) continue;
        const row = next[id];
        if (!row) continue;
        if (
          row.frequency_type !== allowancePreset.frequency_type ||
          row.max_occurrences !== String(allowancePreset.max)
        ) {
          next[id] = {
            ...row,
            frequency_type: allowancePreset.frequency_type,
            max_occurrences: String(allowancePreset.max),
          };
          changed = true;
        }
      }
      return changed ? next : cfg;
    });
  }, [allowancePreset, isFlatFeeMode, overriddenServiceIds]);

  // Live total preview (right of category selector)
  const servicesTotal = useMemo(() => {
    if (isFlatFeeMode) return Number(flatFee) || 0;
    let sum = 0;
    for (const id of selectedServiceIds) {
      const cfg = serviceConfig[id];
      const svc = services.find((s) => s.id === id);
      const qty = Number(cfg?.quantity ?? 1) || 0;
      const rawPrice =
        cfg?.unit_price !== undefined && cfg?.unit_price !== ""
          ? Number(cfg.unit_price)
          : Number(svc?.default_price ?? 0);
      if (!Number.isNaN(rawPrice)) sum += qty * rawPrice;
    }
    return Math.ceil(sum);
  }, [isFlatFeeMode, flatFee, selectedServiceIds, serviceConfig, services]);

  const billingCycleLabel =
    billingCycle === "MONTHLY" ? "Monthly" : billingCycle === "YEARLY" ? "Yearly" : "Ad hoc";
  const billingCyclePeriod =
    billingCycle === "MONTHLY" ? "month" : billingCycle === "YEARLY" ? "year" : "cycle";
  const flatFeeFrequency: FrequencyType =
    billingCycle === "YEARLY" ? "PER_YEAR" : billingCycle === "ONE_TIME" ? "ONE_TIME" : "PER_MONTH";

  // Inventory soft check — populated whenever selected properties change
  const [missingInventory, setMissingInventory] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    const tid = profile.tenant_id;
    setLoading(true);
    Promise.all([
      supabase.from("customers").select("id, name, company_name").eq("tenant_id", tid).order("name"),
      supabase.from("properties").select("id, name, customer_id, zone_id").eq("tenant_id", tid).order("name"),
      supabase.from("service_catalog").select("*").eq("is_active", true).eq("tenant_id", tid).order("code").order("name"),
    ]).then(([custRes, propRes, svcRes]) => {
      setCustomers(custRes.data ?? []);
      setProperties(propRes.data ?? []);
      setServices(svcRes.data ?? []);
      setLoading(false);
    });
  }, [profile?.tenant_id]);

  // Inventory soft warning: re-check whenever selection changes
  useEffect(() => {
    if (selectedPropertyIds.length === 0) {
      setMissingInventory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: inventories } = await supabase
        .from("inventory")
        .select("property_id, inventory_items(id)")
        .in("property_id", selectedPropertyIds);
      const withItems = new Set(
        (inventories ?? [])
          .filter((inv: any) => (inv.inventory_items?.length ?? 0) > 0)
          .map((inv: any) => inv.property_id)
      );
      const missing = selectedPropertyIds
        .filter((id) => !withItems.has(id))
        .map((id) => ({
          id,
          name: properties.find((p) => p.id === id)?.name || "Unknown property",
        }));
      if (!cancelled) setMissingInventory(missing);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPropertyIds, properties]);

  const filteredProperties = useMemo(
    () => properties.filter((p) => p.customer_id === selectedCustomerId),
    [properties, selectedCustomerId]
  );
  const categories = useMemo(
    () => [...new Set(services.map((s) => s.code as string))].sort(),
    [services]
  );
  const filteredServices = useMemo(
    () => services.filter((s) => s.code === selectedCategory),
    [services, selectedCategory]
  );
  const visibleServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    if (!q) return filteredServices;
    return filteredServices.filter((s) =>
      [s.name, s.code, s.description, s.default_unit]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q))
    );
  }, [filteredServices, serviceSearch]);

  const visibleIds = useMemo(() => visibleServices.map((s) => s.id), [visibleServices]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedServiceIds.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selectedServiceIds.includes(id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedServiceIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedServiceIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.add(id));
        // ensure config exists for newly added
        setServiceConfig((cfg) => {
          const updated = { ...cfg };
          visibleIds.forEach((id) => {
            if (!updated[id]) {
              const svc = services.find((s) => s.id === id);
              updated[id] = defaultCfg(svc?.default_price);
            }
          });
          return updated;
        });
        return Array.from(next);
      });
    }
  };

  const toggleProperty = (id: string) =>
    setSelectedPropertyIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const toggleService = (id: string) => {
    setSelectedServiceIds((prev) => {
      const next = prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id];
      if (!prev.includes(id)) {
        const svc = services.find((s) => s.id === id);
        setServiceConfig((cfg) => ({ ...cfg, [id]: defaultCfg(svc?.default_price) }));
      }
      return next;
    });
  };

  const updateServiceConfig = (id: string, field: keyof ServiceCfg, value: string | number) => {
    setServiceConfig((cfg) => ({ ...cfg, [id]: { ...cfg[id], [field]: value } as ServiceCfg }));
    if (field === "frequency_type" || field === "max_occurrences") {
      setOverriddenServiceIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
    }
  };

  const handleCreate = async () => {
    if (!selectedCustomerId) return toast.error("Select a customer");
    if (!name.trim()) return toast.error("Enter a contract name");
    if (selectedPropertyIds.length === 0) return toast.error("Select at least one property");
    if (!startDate || !endDate) return toast.error("Start and end dates are required");
    if (selectedServiceIds.length === 0) return toast.error("Select at least one service");

    if (isFlatFeeMode) {
      if (!flatFee || Number(flatFee) <= 0) {
        return toast.error(`Enter a flat fee per ${billingCycleLabel.toLowerCase()} cycle`);
      }
    } else {
      for (const svcId of selectedServiceIds) {
        const cfg = serviceConfig[svcId];
        if (!cfg?.unit_price || Number(cfg.unit_price) < 0) {
          const svc = services.find((s) => s.id === svcId);
          return toast.error(`Set a unit price for ${svc?.name || "service"}`);
        }
      }
    }

    setSaving(true);
    try {
      const inserts = selectedPropertyIds.map((propertyId) => ({
        contract_name: name.trim(),
        property_id: propertyId,
        start_date: startDate,
        end_date: endDate,
        billing_cycle: billingCycle,
        visit_frequency_count: visitCount,
        visit_frequency_type: visitType,
        status: "DRAFT" as const,
        tenant_id: profile?.tenant_id,
      } as any));

      const { data: created, error } = await supabase.from("contracts").insert(inserts).select("id");
      if (error) throw error;

      const selectedServiceNames = selectedServiceIds
        .map((id) => services.find((s) => s.id === id)?.name)
        .filter(Boolean)
        .join(", ");

      const lineItems: any[] = (created ?? []).flatMap((c: any): any[] => {
        if (isFlatFeeMode) {
          // One row per included service (no per-line price), plus a single flat-fee row
          const serviceRows = selectedServiceIds.map((serviceId) => {
            const cfg = serviceConfig[serviceId] ?? defaultCfg();
            // Fallback: if state never received the preset, apply it now so
            // we never persist an "Unlimited" included line.
            const effectiveFreq =
              cfg.frequency_type && cfg.frequency_type !== "PER_VISIT"
                ? cfg.frequency_type
                : allowancePreset.frequency_type;
            const effectiveMax =
              cfg.max_occurrences !== ""
                ? Number(cfg.max_occurrences)
                : allowancePreset.max;
            return {
              contract_id: c.id,
              service_catalog_id: serviceId,
              quantity: 1,
              frequency_type: effectiveFreq,
              unit_price: null,
              max_occurrences_per_period: effectiveMax,
              is_included_in_base_fee: true,
              tenant_id: profile?.tenant_id,
            };
          });
          const flatRow = {
            contract_id: c.id,
            service_catalog_id: selectedServiceIds[0],
            custom_name: `Flat fee — Regular Maintenance (${billingCycleLabel})`,
            quantity: 1,
            frequency_type: flatFeeFrequency,
            unit_price: Number(flatFee),
            max_occurrences_per_period: null,
            notes: `Flat fee covering: ${selectedServiceNames}`,
            is_included_in_base_fee: false,
            tenant_id: profile?.tenant_id,
          };
          return [...serviceRows, flatRow];
        }
        return selectedServiceIds.map((serviceId) => {
          const cfg = serviceConfig[serviceId] ?? defaultCfg();
          return {
            contract_id: c.id,
            service_catalog_id: serviceId,
            quantity: cfg.quantity || 1,
            frequency_type: cfg.frequency_type,
            unit_price: cfg.unit_price ? Number(cfg.unit_price) : null,
            max_occurrences_per_period: cfg.max_occurrences ? Number(cfg.max_occurrences) : null,
            is_included_in_base_fee: false,
            tenant_id: profile?.tenant_id,
          };
        });
      });
      if (lineItems.length > 0) {
        const { error: liError } = await supabase.from("contract_line_items").insert(lineItems);
        if (liError) toast.error("Contract created but failed to add service lines: " + liError.message);
      }

      toast.success(`${inserts.length} contract(s) created`);
      if (created && created.length === 1) {
        navigate(`/provider/contracts/${created[0].id}`);
      } else {
        navigate("/provider/pipeline");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create contract");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 text-muted-foreground">
          <Link to="/provider/pipeline"><ArrowLeft className="h-4 w-4 mr-1" /> Back to pipeline</Link>
        </Button>
        <h1 className="text-2xl font-bold">New Contract</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Define services, billing, and visit cadence for one or more properties.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT — form */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Customer & properties</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={selectedCustomerId} onValueChange={(v) => { setSelectedCustomerId(v); setSelectedPropertyIds([]); }}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}{c.company_name ? ` (${c.company_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCustomerId && (
                <div className="space-y-2">
                  <Label>Properties * (select one or more)</Label>
                  <div className="border rounded-md p-3 max-h-56 overflow-y-auto divide-y">
                    {filteredProperties.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No properties for this customer.</p>
                    ) : (
                      filteredProperties.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
                          <Checkbox
                            id={`np-${p.id}`}
                            checked={selectedPropertyIds.includes(p.id)}
                            onCheckedChange={() => toggleProperty(p.id)}
                          />
                          <label htmlFor={`np-${p.id}`} className="text-sm cursor-pointer flex-1">{p.name}</label>
                        </div>
                      ))
                    )}
                  </div>
                  {selectedPropertyIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">{selectedPropertyIds.length} selected</p>
                  )}
                </div>
              )}

              {missingInventory.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-900 dark:text-amber-200 space-y-1">
                    <p>
                      {missingInventory.length} of the selected {missingInventory.length === 1 ? "properties has" : "properties have"} no inventory yet. You can still create the contract — adding items later helps service planning.
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {missingInventory.map((p) => (
                        <Link
                          key={p.id}
                          to={`/provider/properties/${p.id}`}
                          className="text-xs underline underline-offset-2 hover:text-amber-700"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open {p.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Contract details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Contract name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual Maintenance 2026" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Start date *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>End date *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Visit frequency</Label>
                  <div className="flex gap-2">
                    <Select
                      value={String(visitCount)}
                      onValueChange={(v) => setVisitCount(Number(v))}
                      disabled={visitType === "CONTRACT"}
                    >
                      <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={visitType}
                      onValueChange={(v) => {
                        setVisitType(v);
                        if (v === "CONTRACT") setVisitCount(1);
                      }}
                    >
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WEEK">per Week</SelectItem>
                        <SelectItem value="MONTH">per Month</SelectItem>
                        <SelectItem value="YEAR">per Year</SelectItem>
                        <SelectItem value="CONTRACT">per Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Billing cycle</Label>
                  <Select value={billingCycle} onValueChange={(v) => setBillingCycle(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="ONE_TIME">Ad hoc</SelectItem>
                      <SelectItem value="YEARLY">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Services</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div className="space-y-2 w-full max-w-xs">
                  <Label>Category</Label>
                  <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setServiceSearch(""); }}>
                    <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedCategory && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2 text-right min-w-[180px]">
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        servicesTotal > 0 ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {isFlatFeeMode ? "Flat: " : "Total: "}
                      {servicesTotal.toLocaleString()} {currency}
                      {isFlatFeeMode && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}/ {billingCyclePeriod}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedServiceIds.length} service{selectedServiceIds.length === 1 ? "" : "s"} selected
                    </div>
                  </div>
                )}
              </div>

              {selectedCategory && !isFlatFeeMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label>Catalog services</Label>
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={serviceSearch}
                        onChange={(e) => setServiceSearch(e.target.value)}
                        placeholder="Search services…"
                        className="pl-8 h-9"
                      />
                    </div>
                  </div>
                  <div className="border rounded-md overflow-hidden">
                    <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground sticky top-0">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left">
                              <Checkbox
                                checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                                onCheckedChange={toggleAllVisible}
                                aria-label="Select all visible"
                              />
                            </th>
                            <th className="px-3 py-2 text-left font-medium">Code</th>
                            {isFlatFeeMode && (
                              <>
                                <th className="px-3 py-2 text-left font-medium w-[140px]">Frequency</th>
                                <th className="px-3 py-2 text-left font-medium w-[110px]">Max / period</th>
                              </>
                            )}
                            <th className="px-3 py-2 text-left font-medium">Name</th>
                            <th className="px-3 py-2 text-left font-medium">Description</th>
                            <th className="px-3 py-2 text-left font-medium">Unit</th>
                            {!isFlatFeeMode && (
                              <th className="px-3 py-2 text-right font-medium">Default price</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {visibleServices.length === 0 ? (
                            <tr><td colSpan={isFlatFeeMode ? 7 : 6} className="px-3 py-6 text-center text-muted-foreground">No services match.</td></tr>
                          ) : visibleServices.map((svc) => {
                            const checked = selectedServiceIds.includes(svc.id);
                            const rowCfg = serviceConfig[svc.id] ?? defaultCfg(svc?.default_price);
                            return (
                              <tr
                                key={svc.id}
                                className={`hover:bg-muted/30 cursor-pointer ${checked ? "bg-primary/5" : ""}`}
                                onClick={() => toggleService(svc.id)}
                              >
                                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox checked={checked} onCheckedChange={() => toggleService(svc.id)} />
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{svc.code}</td>
                                {isFlatFeeMode && (
                                  <>
                                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                      <Select
                                        value={rowCfg.frequency_type}
                                        onValueChange={(v) => {
                                          if (!checked) toggleService(svc.id);
                                          updateServiceConfig(svc.id, "frequency_type", v as FrequencyType);
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="PER_VISIT">Per Visit</SelectItem>
                                          <SelectItem value="PER_WEEK">Per Week</SelectItem>
                                          <SelectItem value="PER_MONTH">Per Month</SelectItem>
                                          <SelectItem value="PER_YEAR">Per Year</SelectItem>
                                          <SelectItem value="ONE_TIME">One-time</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                      <Input
                                        type="number"
                                        min="1"
                                        placeholder="∞"
                                        className="h-8 text-xs"
                                        value={rowCfg.max_occurrences}
                                        onChange={(e) => {
                                          if (!checked && e.target.value) toggleService(svc.id);
                                          updateServiceConfig(svc.id, "max_occurrences", e.target.value);
                                        }}
                                      />
                                    </td>
                                  </>
                                )}
                                <td className="px-3 py-2 font-medium">{svc.name}</td>
                                <td className="px-3 py-2 text-muted-foreground max-w-[280px] truncate" title={svc.description ?? ""}>{svc.description ?? "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground">{svc.default_unit ?? "—"}</td>
                                {!isFlatFeeMode && (
                                  <td className="px-3 py-2 text-right tabular-nums">{svc.default_price != null ? `${svc.default_price} ${currency}` : "—"}</td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedServiceIds.filter((id) => filteredServices.some((s) => s.id === id)).length} of {filteredServices.length} selected in this category
                  </p>
                </div>
              )}

              {isFlatFeeMode && selectedServiceIds.length > 0 && (
                <div className="border rounded-md p-4 bg-primary/5 space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Flat fee per {billingCycleLabel} billing cycle *</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Covers all {selectedServiceIds.length} selected service(s) for each billing cycle. Visits are scheduled per the cadence above.
                    </p>
                  </div>
                  <div className="max-w-xs">
                    <CurrencyInput
                      currency={currency}
                      min="0"
                      placeholder="0.00"
                      value={flatFee}
                      onChange={(e) => setFlatFee(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {!isFlatFeeMode && selectedServiceIds.length > 0 && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-muted-foreground font-medium">{selectedServiceIds.length} service(s) — configure each:</p>
                  {selectedServiceIds.map((id) => {
                    const svc = services.find((s) => s.id === id);
                    const cfg = serviceConfig[id] ?? defaultCfg();
                    if (!svc) return null;
                    return (
                      <div key={id} className="border rounded-md p-3 space-y-3 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{svc.name}</span>
                          <button type="button" onClick={() => toggleService(id)} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Frequency</Label>
                            <Select value={cfg.frequency_type} onValueChange={(v) => updateServiceConfig(id, "frequency_type", v as FrequencyType)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PER_VISIT">Per Visit</SelectItem>
                                <SelectItem value="PER_WEEK">Per Week</SelectItem>
                                <SelectItem value="PER_MONTH">Per Month</SelectItem>
                                <SelectItem value="PER_YEAR">Per Year</SelectItem>
                                <SelectItem value="PER_CONTRACT">Per Contract</SelectItem>
                                <SelectItem value="ONE_TIME">One-time</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Quantity</Label>
                            <Input type="number" min="1" value={cfg.quantity}
                              onChange={(e) => updateServiceConfig(id, "quantity", Number(e.target.value) || 1)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Unit price *</Label>
                            <CurrencyInput currency={currency} min="0" placeholder="0.00"
                              value={cfg.unit_price}
                              onChange={(e) => updateServiceConfig(id, "unit_price", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Max / period</Label>
                            <Input type="number" placeholder="∞"
                              value={cfg.max_occurrences}
                              onChange={(e) => updateServiceConfig(id, "max_occurrences", e.target.value)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — summary */}
        <div className="space-y-5">
          <Card className="lg:sticky lg:top-4">
            <CardHeader className="pb-3"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Customer">
                {customers.find((c) => c.id === selectedCustomerId)?.name || <Muted>—</Muted>}
              </Row>
              <Row label="Properties">
                {selectedPropertyIds.length > 0 ? (
                  <Badge variant="secondary">{selectedPropertyIds.length}</Badge>
                ) : (
                  <Muted>None</Muted>
                )}
              </Row>
              <Row label="Services">
                {selectedServiceIds.length > 0 ? (
                  <Badge variant="secondary">{selectedServiceIds.length}</Badge>
                ) : (
                  <Muted>None</Muted>
                )}
              </Row>
              <Row label="Visits">
                {visitCount} / {visitType.toLowerCase()}
              </Row>
              <Row label="Billing">{billingCycle.replace("_", " ").toLowerCase()}</Row>
              {isFlatFeeMode && (
                <Row label="Flat fee">
                  {flatFee && Number(flatFee) > 0 ? (
                    <span className="font-medium">{Number(flatFee).toLocaleString()} {currency} / {billingCyclePeriod}</span>
                  ) : (
                    <Muted>—</Muted>
                  )}
                </Row>
              )}
              <Row label="Inventory">
                {selectedPropertyIds.length === 0 ? (
                  <Muted>—</Muted>
                ) : missingInventory.length === 0 ? (
                  <span className="text-emerald-700 dark:text-emerald-400">All set</span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400">{missingInventory.length} missing</span>
                )}
              </Row>

              <div className="pt-2 space-y-2">
                <Button className="w-full" onClick={handleCreate} disabled={saving || loading}>
                  {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…</> : "Create Contract"}
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link to="/provider/pipeline">Cancel</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}