import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Save, Infinity as InfinityIcon } from "lucide-react";
import { toast } from "sonner";

interface Tier { tier: string; display_name: string; sort_order: number; price_monthly_eur: number | null; notes: string | null }
interface KeyDef { key: string; label: string; category: string; value_type: "int"|"bool"|"enum"; enum_values: string[] | null; unlimited_sentinel: number | null; description: string | null; default_value: unknown; sort_order: number }
interface ValueRow { tier: string; key: string; value: unknown }

const CATEGORIES = ["limits","features","integrations","support"] as const;

export default function PlanEntitlements() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [keys, setKeys] = useState<KeyDef[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({}); // `${tier}::${key}` -> value
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [tenantCounts, setTenantCounts] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    const [t, k, v, c] = await Promise.all([
      supabase.from("plan_entitlements").select("*").order("sort_order"),
      supabase.from("entitlement_keys").select("*").order("category").order("sort_order"),
      supabase.from("plan_entitlement_values").select("tier, key, value"),
      supabase.from("tenants").select("subscription_tier"),
    ]);
    setTiers((t.data as Tier[]) ?? []);
    setKeys((k.data as KeyDef[]) ?? []);
    const map: Record<string, unknown> = {};
    for (const row of (v.data as ValueRow[]) ?? []) map[`${row.tier}::${row.key}`] = row.value;
    setValues(map);
    const counts: Record<string, number> = {};
    for (const row of (c.data as { subscription_tier: string }[]) ?? []) {
      counts[row.subscription_tier] = (counts[row.subscription_tier] ?? 0) + 1;
    }
    setTenantCounts(counts);
    setDirty(new Set());
  };

  useEffect(() => { void load(); }, []);

  const setCell = (tier: string, key: string, val: unknown) => {
    const id = `${tier}::${key}`;
    setValues(prev => ({ ...prev, [id]: val }));
    setDirty(prev => new Set(prev).add(id));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const items = Array.from(dirty);
      for (const id of items) {
        const [tier, key] = id.split("::");
        const v = values[id];
        const { error } = await supabase.rpc("fn_set_entitlement", { p_tier: tier, p_key: key, p_value: v as never });
        if (error) throw error;
      }
      toast.success(`Saved ${items.length} change${items.length === 1 ? "" : "s"}`);
      await load();
    } catch (e) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const savePrice = async (tier: string, price: number | null) => {
    const { error } = await supabase.from("plan_entitlements").update({ price_monthly_eur: price }).eq("tier", tier);
    if (error) { toast.error(error.message); return; }
    toast.success("Price updated");
    void load();
  };

  const byCategory = useMemo(() => {
    const g: Record<string, KeyDef[]> = {};
    for (const k of keys) (g[k.category] ??= []).push(k);
    return g;
  }, [keys]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plans & Entitlements</h1>
          <p className="text-sm text-muted-foreground">Edit tier capabilities live. Changes are audited and apply on each tenant's next refresh.</p>
        </div>
        <div className="flex gap-2">
          <AddKeyDialog open={addOpen} setOpen={setAddOpen} onAdded={load} />
          <Button onClick={saveAll} disabled={dirty.size === 0 || saving}>
            <Save className="h-4 w-4 mr-2" />
            {dirty.size > 0 ? `Save ${dirty.size}` : "No changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Tier metadata</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {tiers.map(t => (
              <div key={t.tier} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{t.display_name}</div>
                  <Badge variant="secondary">{tenantCounts[t.tier] ?? 0}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{t.notes}</div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">€</span>
                  <Input
                    type="number"
                    className="h-8"
                    defaultValue={t.price_monthly_eur ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v !== t.price_monthly_eur) void savePrice(t.tier, v);
                    }}
                  />
                  <span className="text-xs text-muted-foreground">/mo</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="limits">
        <TabsList>
          {CATEGORIES.map(c => (
            <TabsTrigger key={c} value={c} className="capitalize">{c}</TabsTrigger>
          ))}
        </TabsList>
        {CATEGORIES.map(category => (
          <TabsContent key={category} value={category}>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Capability</th>
                      {tiers.map(t => <th key={t.tier} className="text-left px-3 py-3 font-medium">{t.display_name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(byCategory[category] ?? []).map(k => (
                      <tr key={k.key} className="border-t">
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium">{k.label}</div>
                          <div className="text-xs text-muted-foreground font-mono">{k.key}</div>
                          {k.description && <div className="text-xs text-muted-foreground mt-1 max-w-md">{k.description}</div>}
                        </td>
                        {tiers.map(t => {
                          const id = `${t.tier}::${k.key}`;
                          const raw = values[id];
                          const isDirty = dirty.has(id);
                          return (
                            <td key={t.tier} className={`px-3 py-3 align-top ${isDirty ? "bg-emerald-50" : ""}`}>
                              {k.value_type === "bool" && (
                                <Switch checked={raw === true || raw === "true"} onCheckedChange={(c) => setCell(t.tier, k.key, c)} />
                              )}
                              {k.value_type === "int" && (
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    className="h-8 w-24"
                                    value={Number(raw ?? 0)}
                                    onChange={(e) => setCell(t.tier, k.key, Number(e.target.value))}
                                  />
                                  {k.unlimited_sentinel != null && (
                                    <Button
                                      type="button" variant="ghost" size="sm"
                                      className="h-8 px-2"
                                      title="Set unlimited"
                                      onClick={() => setCell(t.tier, k.key, k.unlimited_sentinel)}
                                    >
                                      <InfinityIcon className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {Number(raw ?? 0) >= (k.unlimited_sentinel ?? Infinity) && (
                                    <Badge variant="secondary" className="text-[10px]">∞</Badge>
                                  )}
                                </div>
                              )}
                              {k.value_type === "enum" && (
                                <Select value={String(raw ?? "")} onValueChange={(v) => setCell(t.tier, k.key, v)}>
                                  <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {(k.enum_values ?? []).map(ev => <SelectItem key={ev} value={ev}>{ev}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function AddKeyDialog({ open, setOpen, onAdded }: { open: boolean; setOpen: (v: boolean) => void; onAdded: () => void | Promise<void> }) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]>("features");
  const [valueType, setValueType] = useState<"int"|"bool"|"enum">("bool");
  const [defaultValue, setDefaultValue] = useState("false");
  const [enumValues, setEnumValues] = useState("");
  const [description, setDescription] = useState("");

  const submit = async () => {
    try {
      let parsed: unknown;
      if (valueType === "int") parsed = Number(defaultValue);
      else if (valueType === "bool") parsed = defaultValue === "true";
      else parsed = defaultValue;
      const { error } = await supabase.rpc("fn_add_entitlement_key", {
        p_key: key, p_label: label, p_category: category, p_value_type: valueType,
        p_default_value: parsed as never,
        p_description: description || null,
        p_enum_values: valueType === "enum" ? enumValues.split(",").map(s => s.trim()).filter(Boolean) : null,
        p_unlimited_sentinel: valueType === "int" ? 999 : null,
      });
      if (error) throw error;
      toast.success(`Added ${key}`);
      setOpen(false);
      setKey(""); setLabel(""); setDescription(""); setDefaultValue("false"); setEnumValues("");
      await onAdded();
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to add");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Plus className="h-4 w-4 mr-2" />Add capability</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add entitlement capability</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Key (snake_case)</Label><Input value={key} onChange={e => setKey(e.target.value)} placeholder="e.g. max_invoices" /></div>
          <div><Label>Human label</Label><Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Max invoices / month" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as typeof CATEGORIES[number])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={valueType} onValueChange={(v) => { setValueType(v as "int"|"bool"|"enum"); setDefaultValue(v === "bool" ? "false" : v === "int" ? "0" : ""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bool">bool</SelectItem>
                  <SelectItem value="int">int</SelectItem>
                  <SelectItem value="enum">enum</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {valueType === "enum" && (
            <div><Label>Enum values (comma separated)</Label><Input value={enumValues} onChange={e => setEnumValues(e.target.value)} placeholder="none,basic,pro" /></div>
          )}
          <div><Label>Default value (seeded for every tier)</Label>
            {valueType === "bool" ? (
              <Select value={defaultValue} onValueChange={setDefaultValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="false">false</SelectItem><SelectItem value="true">true</SelectItem></SelectContent>
              </Select>
            ) : (
              <Input value={defaultValue} onChange={e => setDefaultValue(e.target.value)} />
            )}
          </div>
          <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!key || !label}>Add capability</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}