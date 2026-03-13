import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin } from "lucide-react";
import { InventoryTab } from "@/components/provider/InventoryTab";
import { PropertyContractsTab } from "@/components/provider/PropertyContractsTab";
import { PropertyVisitsTab } from "@/components/provider/PropertyVisitsTab";

export default function PropertyDetail() {
  const { propertyId } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);

  useEffect(() => { load(); }, [propertyId]);

  const load = async () => {
    const { data: p } = await supabase.from("properties").select("*, customers(*)").eq("id", propertyId!).single();
    if (p) {
      setProperty(p);
      setCustomer((p as any).customers);
    }
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
