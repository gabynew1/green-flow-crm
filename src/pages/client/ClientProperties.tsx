import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Copy } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function ClientProperties() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    const { data } = await supabase
      .from("properties")
      .select("*, customers(name)")
      .order("name");
    setProperties(data ?? []);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Properties</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {properties.map(p => (
          <Link key={p.id} to={`/client/properties/${p.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{[p.address, p.city].filter(Boolean).join(", ")}</p>
                    <Badge variant={p.status === "active" ? "default" : "secondary"} className="mt-2">{p.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {properties.length === 0 && <p className="text-muted-foreground col-span-full text-center py-8">No properties assigned to your account</p>}
      </div>
    </div>
  );
}
