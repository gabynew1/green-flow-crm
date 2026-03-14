import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";

interface InspectionsProps {
  embedded?: boolean;
  statusFilter?: string;
}

export default function Inspections({ embedded = false, statusFilter }: InspectionsProps) {
  const navigate = useNavigate();

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ["inspections", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("inspections")
        .select("*, customers(name), properties(name)")
        .order("created_at", { ascending: false });

      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SCHEDULED: "bg-blue-100 text-blue-800",
    COMPLETED: "bg-green-100 text-green-800",
    OFFER_GENERATED: "bg-purple-100 text-purple-800",
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className={embedded ? "" : "space-y-5"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Inspections</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All inspection records</p>
        </div>
      )}

      {inspections.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <ClipboardCheck className="mx-auto h-8 w-8 mb-2 opacity-40" />
            No inspections found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {inspections.map((insp: any) => (
            <Card
              key={insp.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/provider/inspections/${insp.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{insp.title}</CardTitle>
                  <Badge className={statusColor[insp.status] || ""}>{insp.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <span>{insp.customers?.name}</span>
                {insp.properties?.name && <span> · {insp.properties.name}</span>}
                {insp.inspected_date && <span> · {insp.inspected_date}</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
