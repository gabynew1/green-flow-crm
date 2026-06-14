import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Pencil, Loader2 } from "lucide-react";
import { InventoryTab } from "@/components/provider/InventoryTab";
import { PropertyContractsTab } from "@/components/provider/PropertyContractsTab";
import { PropertyVisitsTab } from "@/components/provider/PropertyVisitsTab";

const safeColor = (c?: string | null) =>
  c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#10b981";

export default function PropertyDetail() {
  const { propertyId } = useParams();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [property, setProperty] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [zones, setZones] = useState<{ id: string; name: string; color: string }[]>([]);
  const [editingZone, setEditingZone] = useState(false);
  const [pendingZoneId, setPendingZoneId] = useState<string | null>(null);
  const [savingZone, setSavingZone] = useState(false);

  const canEdit = profile?.provider_permission === "full_admin";

  useEffect(() => { load(); }, [propertyId]);
  useEffect(() => {
    if (!profile?.tenant_id) return;
    supabase
      .from("service_zones")
      .select("id, name, color")
      .eq("tenant_id", profile.tenant_id)
      .order("name")
      .then(({ data }) => setZones((data ?? []) as { id: string; name: string; color: string }[]));
  }, [profile?.tenant_id]);

  const load = async () => {
    const { data: p } = await supabase
      .from("properties")
      .select("*, customers(*), service_zones(id, name, color)")
      .eq("id", propertyId!)
      .single();
    if (p) {
      setProperty(p);
      setCustomer((p as any).customers);
    }
  };

  const handleSaveZone = async () => {
    setSavingZone(true);
    const { error } = await supabase
      .from("properties")
      .update({ zone_id: pendingZoneId })
      .eq("id", propertyId!);
    setSavingZone(false);
    if (error) {
      toast.error("Failed to save zone: " + error.message);
      return;
    }
    toast.success("Zone updated");
    await load();
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    setEditingZone(false);
  };

  if (!property) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={customer ? `/provider/customers/${customer.id}` : "/provider/customers"}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          {customer && <p className="text-sm text-muted-foreground">{customer.name}</p>}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> {[property.address, property.city].filter(Boolean).join(", ") || "No address"}</div>
          <Badge variant={property.status === "active" ? "default" : "secondary"}>{property.status}</Badge>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Zone:</span>
            {editingZone ? (
              <div className="flex items-center gap-1.5">
                <Select
                  value={pendingZoneId ?? "__none__"}
                  onValueChange={(v) => setPendingZoneId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="h-8 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No zone —</SelectItem>
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: safeColor(z.color) }} />
                          {z.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={handleSaveZone} disabled={savingZone}>
                  {savingZone ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingZone(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {property.service_zones ? (
                  <>
                    <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: safeColor(property.service_zones.color) }} />
                    <span>{property.service_zones.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not assigned</span>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => { setPendingZoneId(property.zone_id ?? null); setEditingZone(true); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
          {property.description && <p className="w-full text-muted-foreground">{property.description}</p>}
        </CardContent>
      </Card>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="visits">Service Visits</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="mt-4">
          <InventoryTab propertyId={propertyId!} />
        </TabsContent>
        <TabsContent value="contracts" className="mt-4">
          <PropertyContractsTab propertyId={propertyId!} />
        </TabsContent>
        <TabsContent value="visits" className="mt-4">
          <PropertyVisitsTab propertyId={propertyId!} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
