import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin } from "lucide-react";

export default function ClientPropertyDetail() {
  const { propertyId } = useParams();
  const [property, setProperty] = useState<any>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);

  useEffect(() => { load(); }, [propertyId]);

  const load = async () => {
    const { data: p } = await supabase.from("properties").select("*").eq("id", propertyId!).single();
    setProperty(p);

    const { data: inv } = await supabase.from("inventory").select("id").eq("property_id", propertyId!).single();
    if (inv) {
      const { data: items } = await supabase.from("inventory_items").select("*").eq("inventory_id", inv.id).order("category");
      setInventoryItems(items ?? []);
    }

    const { data: visits } = await supabase
      .from("service_orders")
      .select("id, scheduled_date, period_label, status")
      .eq("property_id", propertyId!)
      .order("scheduled_date", { ascending: false })
      .limit(5);
    setRecentVisits(visits ?? []);
  };

  if (!property) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/client"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold">{property.name}</h1>
      </div>

      <Card>
        <CardContent className="pt-6 text-sm space-y-2">
          <div className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> {[property.address, property.city].filter(Boolean).join(", ")}</div>
          {property.description && <p className="text-muted-foreground">{property.description}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Green Inventory</CardTitle></CardHeader>
        <CardContent>
          {inventoryItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inventory data available</p>
          ) : (
            <div className="space-y-2">
              {inventoryItems.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Recent Service Visits</CardTitle></CardHeader>
        <CardContent>
          {recentVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits yet</p>
          ) : (
            <div className="space-y-2">
              {recentVisits.map(v => (
                <Link key={v.id} to={`/client/visits/${v.id}`} className="flex items-center justify-between text-sm py-2 border-b last:border-0 hover:bg-muted/50 rounded px-2 -mx-2">
                  <span>{v.period_label || v.scheduled_date}</span>
                  <Badge variant="outline">{v.status.replace(/_/g, " ")}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
