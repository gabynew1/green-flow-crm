import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { FileOutput } from "lucide-react";

interface OffersProps {
  embedded?: boolean;
}

export default function Offers({ embedded = false }: OffersProps) {
  const navigate = useNavigate();

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("*, customers(name), properties(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    IN_PROGRESS: "bg-yellow-100 text-yellow-800",
    SENT_TO_CLIENT: "bg-blue-100 text-blue-800",
    ACCEPTED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    EXPIRED: "bg-orange-100 text-orange-800",
    CANCELED: "bg-muted text-muted-foreground",
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className={embedded ? "" : "space-y-5"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Offers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All offer records</p>
        </div>
      )}

      {offers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileOutput className="mx-auto h-8 w-8 mb-2 opacity-40" />
            No offers found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {offers.map((offer: any) => (
            <Card
              key={offer.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/provider/offers/${offer.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{offer.offer_name}</CardTitle>
                  <Badge className={statusColor[offer.status] || ""}>{offer.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <span>{offer.customers?.name}</span>
                {offer.properties?.name && <span> · {offer.properties.name}</span>}
                {offer.total_value != null && <span> · ${offer.total_value}</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
