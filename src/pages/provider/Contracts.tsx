import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { FileText } from "lucide-react";

interface ContractsProps {
  embedded?: boolean;
}

export default function Contracts({ embedded = false }: ContractsProps) {
  const navigate = useNavigate();

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, properties(name, customers(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const statusColor: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SENT_TO_CLIENT: "bg-blue-100 text-blue-800",
    SIGNED: "bg-green-100 text-green-800",
    ACTIVE: "bg-emerald-100 text-emerald-800",
    CLOSED: "bg-muted text-muted-foreground",
    REJECTED: "bg-red-100 text-red-800",
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className={embedded ? "" : "space-y-5"}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">Contracts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All contract records</p>
        </div>
      )}

      {contracts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FileText className="mx-auto h-8 w-8 mb-2 opacity-40" />
            No contracts found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {contracts.map((contract: any) => (
            <Card
              key={contract.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/provider/contracts/${contract.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">{contract.contract_name}</CardTitle>
                  <Badge className={statusColor[contract.status] || ""}>{contract.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <span>{(contract.properties as any)?.customers?.name}</span>
                {(contract.properties as any)?.name && <span> · {(contract.properties as any).name}</span>}
                <span> · {contract.start_date}{contract.end_date ? ` → ${contract.end_date}` : ""}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
