import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Archive, ClipboardCheck, FileOutput, FileText, Lightbulb } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusVariantInspection: Record<string, "default" | "secondary" | "outline"> = {
  DRAFT: "secondary",
  COMPLETED: "default",
  OFFER_GENERATED: "outline",
};

const statusVariantOffer: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  IN_PROGRESS: "secondary",
  SENT_TO_CLIENT: "outline",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "destructive",
  CANCELED: "destructive",
};

const statusVariantContract: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT_TO_CLIENT: "outline",
  SIGNED: "default",
  ACTIVE: "default",
  CLOSED: "destructive",
};

interface KanbanColumn {
  title: string;
  icon: React.ElementType;
  items: any[];
  type: "opportunity" | "inspection" | "offer" | "contract";
  color: string;
}

export default function PipelineKanban() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const [insRes, offRes, conRes] = await Promise.all([
      supabase.from("inspections").select("*, properties(name, customers(name))").eq("archived", false).order("created_at", { ascending: false }),
      supabase.from("offers").select("*, properties(name, customers(name))").eq("archived", false).order("created_at", { ascending: false }),
      supabase.from("contracts").select("*, properties(name, customers(name))").eq("archived", false).order("created_at", { ascending: false }),
    ]);
    setInspections(insRes.data ?? []);
    setOffers(offRes.data ?? []);
    setContracts(conRes.data ?? []);
    setLoading(false);
  };

  const handleGenerateOffer = async (inspection: any) => {
    const { error: offerErr } = await supabase.from("offers").insert({
      offer_name: `Offer - ${inspection.title}`,
      property_id: inspection.property_id,
      customer_id: inspection.customer_id,
      tenant_id: inspection.tenant_id,
      inspection_id: inspection.id,
      created_by: user!.id,
    });
    if (offerErr) { toast.error(offerErr.message); return; }
    await supabase.from("inspections").update({ status: "COMPLETED" }).eq("id", inspection.id);
    toast.success("Offer generated from inspection");
    load();
  };

  const handleArchive = async (table: "inspections" | "offers" | "contracts", id: string) => {
    const { error } = await supabase.from(table).update({ archived: true } as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Archived successfully");
    load();
  };

  const columns: KanbanColumn[] = [
    {
      title: "Opportunities",
      icon: Lightbulb,
      items: inspections.filter(i => i.status === "DRAFT"),
      type: "opportunity",
      color: "bg-accent/10 border-accent/30",
    },
    {
      title: "Inspections",
      icon: ClipboardCheck,
      items: inspections.filter(i => i.status === "SCHEDULED"),
      type: "inspection",
      color: "bg-info/10 border-info/30",
    },
    {
      title: "Offers",
      icon: FileOutput,
      items: offers,
      type: "offer",
      color: "bg-warning/10 border-warning/30",
    },
    {
      title: "Contracts",
      icon: FileText,
      items: contracts,
      type: "contract",
      color: "bg-success/10 border-success/30",
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((col) => (
        <div key={col.title} className="space-y-3">
          <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${col.color}`}>
            <col.icon className="h-4 w-4" />
            <span className="text-sm font-semibold">{col.title}</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{col.items.length}</Badge>
          </div>

          <div className="space-y-2 min-h-[100px]">
            {col.items.map((item) => {
              const customerName = (item.properties as any)?.customers?.name || "—";
              const propertyName = (item.properties as any)?.name || "—";
              const title = item.title || item.offer_name || item.contract_name;
              const status = item.status;

              let detailLink = "";
              let statusBadgeVariant: "default" | "secondary" | "outline" | "destructive" = "secondary";

              if (col.type === "opportunity" || col.type === "inspection") {
                detailLink = `/provider/inspections/${item.id}`;
                statusBadgeVariant = statusVariantInspection[status] || "secondary";
              } else if (col.type === "offer") {
                detailLink = `/provider/offers/${item.id}`;
                statusBadgeVariant = statusVariantOffer[status] || "secondary";
              } else {
                detailLink = `/provider/contracts/${item.id}`;
                statusBadgeVariant = statusVariantContract[status] || "secondary";
              }

              const archiveTable: "inspections" | "offers" | "contracts" =
                col.type === "opportunity" || col.type === "inspection" ? "inspections" :
                col.type === "offer" ? "offers" : "contracts";

              return (
                <Card key={item.id} className="hover:border-primary/40 transition-colors">
                  <CardContent className="p-3 space-y-2">
                    <Link to={detailLink} className="block">
                      <p className="text-sm font-medium truncate">{title}</p>
                      <p className="text-xs text-muted-foreground truncate">{customerName} · {propertyName}</p>
                    </Link>
                    <div className="flex items-center justify-between gap-1">
                      <Badge variant={statusBadgeVariant} className="text-[10px]">
                        {status.replace(/_/g, " ")}
                      </Badge>

                      <div className="flex items-center gap-1">
                        {/* Primary action */}
                        {col.type === "opportunity" && status === "DRAFT" && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={() => navigate(`/provider/inspections/${item.id}`)}>
                            Schedule <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                        {col.type === "inspection" && status === "SCHEDULED" && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={() => handleGenerateOffer(item)}>
                            Gen. Offer <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}
                        {col.type === "offer" && status === "ACCEPTED" && (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={() => navigate(`/provider/offers/${item.id}`)}>
                            Gen. Contract <ArrowRight className="h-3 w-3" />
                          </Button>
                        )}

                        {/* Archive action */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                              <Archive className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Archive this item?</AlertDialogTitle>
                              <AlertDialogDescription>
                                It will be removed from the pipeline view but remain in historical records.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleArchive(archiveTable, item.id)}>
                                Archive
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {col.items.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No items</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}