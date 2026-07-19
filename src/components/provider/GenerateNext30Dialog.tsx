import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { generateSchedule, type ExistingVisitMap, type ScheduledVisit, type ScheduledVisitMeta, type ZoneDateMap } from "@/lib/schedule-engine";
import { TEAM_DAY_WARNING_THRESHOLD } from "@/lib/scheduling-constants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: any;
  lineItems: any[];
  teamId: string;
  teamName: string;
  tenantId: string | null;
  userId: string;
  isWorkday: (d: Date) => boolean;
  zoneDateMap: ZoneDateMap;
  onGenerated: () => void;
}

const HORIZON_DAYS = 30;

export function GenerateNext30Dialog({
  open,
  onOpenChange,
  contract,
  lineItems,
  teamId,
  teamName,
  tenantId,
  userId,
  isWorkday,
  zoneDateMap,
  onGenerated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ visits: ScheduledVisit[]; meta: ScheduledVisitMeta[] }>({ visits: [], meta: [] });

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const horizonEnd = format(new Date(Date.now() + HORIZON_DAYS * 86400000), "yyyy-MM-dd");

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        // Occupancy for this team
        const { data: existingOrders } = await supabase
          .from("service_orders")
          .select("scheduled_date, team_id")
          .eq("team_id", teamId)
          .not("scheduled_date", "is", null);
        const occupancy: ExistingVisitMap = {};
        for (const o of existingOrders ?? []) {
          const key = `${o.scheduled_date}_${o.team_id}`;
          occupancy[key] = (occupancy[key] || 0) + 1;
        }
        // Dates already booked for this contract → skip in preview
        const { data: contractOrders } = await supabase
          .from("service_orders")
          .select("scheduled_date")
          .eq("contract_id", contract.id);
        const existingDates = new Set((contractOrders ?? []).map((o: any) => o.scheduled_date));

        const itemsForSchedule = lineItems.map(li => ({
          id: li.id,
          service_catalog_id: li.service_catalog_id,
          name: li.custom_name || (li.service_catalog as any)?.name || "Service",
          quantity: li.quantity,
          unit: li.unit,
        }));

        const anchorStart = contract.start_date < todayStr ? todayStr : contract.start_date;
        const contractEnd = contract.end_date && contract.end_date < horizonEnd ? contract.end_date : horizonEnd;

        const { visits, meta } = generateSchedule(
          {
            startDate: anchorStart,
            endDate: contractEnd,
            frequencyCount: contract.visit_frequency_count || 1,
            frequencyType: contract.visit_frequency_type || "WEEK",
            teamId,
            contractId: contract.id,
            propertyId: (contract.properties as any).id,
            userId,
            contractName: contract.contract_name,
            lineItems: itemsForSchedule,
            zoneId: ((contract.properties as any)?.zone_id ?? null) as string | null,
          },
          { isWorkday },
          occupancy,
          { ...zoneDateMap },
        );

        const filtered: { visits: ScheduledVisit[]; meta: ScheduledVisitMeta[] } = { visits: [], meta: [] };
        visits.forEach((v, i) => {
          if (!existingDates.has(v.scheduled_date)) {
            filtered.visits.push(v);
            filtered.meta.push(meta[i]);
          }
        });
        setPreview(filtered);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, teamId, contract?.id]);

  const heavyCount = useMemo(() => preview.meta.filter(m => m.is_heavy_day).length, [preview.meta]);

  const handleCommit = async () => {
    if (preview.visits.length === 0) return;
    setSaving(true);
    try {
      const withTenant = preview.visits.map(v => ({ ...v, tenant_id: tenantId }));
      const { data: created, error } = await supabase.from("service_orders").insert(withTenant).select("id");
      if (error) throw error;

      const itemsForSchedule = lineItems.map(li => ({
        id: li.id,
        service_catalog_id: li.service_catalog_id,
        name: li.custom_name || (li.service_catalog as any)?.name || "Service",
        quantity: li.quantity,
        unit: li.unit,
      }));
      const allItems = (created ?? []).flatMap(so =>
        itemsForSchedule.map(li => ({
          service_order_id: so.id,
          contract_line_item_id: li.id,
          service_catalog_id: li.service_catalog_id,
          name: li.name,
          quantity: li.quantity,
          unit: li.unit,
          source: "CONTRACT" as const,
          tenant_id: tenantId,
        }))
      );
      if (allItems.length > 0) {
        await supabase.from("service_order_items").insert(allItems as any);
      }
      toast.success(`Created ${created?.length ?? 0} visit${(created?.length ?? 0) === 1 ? "" : "s"}`);
      onGenerated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to generate visits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate next 30 days</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <p><span className="font-medium text-foreground">Contract:</span> {contract?.contract_name}</p>
            <p><span className="font-medium text-foreground">Window:</span> {todayStr} → {horizonEnd}</p>
            <p><span className="font-medium text-foreground">Recurrence:</span> {contract?.visit_frequency_count ?? 1}× per {contract?.visit_frequency_type?.toLowerCase() || "week"} · {teamName}</p>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Computing schedule…
            </div>
          ) : preview.visits.length === 0 ? (
            <p className="py-6 text-sm text-center text-muted-foreground">
              Nothing new to schedule — every date in the next 30 days already has a visit.
            </p>
          ) : (
            <div className="max-h-64 overflow-auto rounded border">
              <table className="w-full text-sm">
                <tbody>
                  {preview.visits.map((v, i) => {
                    const heavy = preview.meta[i]?.is_heavy_day;
                    return (
                      <tr key={`${v.scheduled_date}-${i}`} className={`border-b last:border-0 ${heavy ? "bg-orange-500/10" : ""}`}>
                        <td className="px-3 py-2 font-medium">{format(new Date(v.scheduled_date), "EEE MMM d")}</td>
                        <td className="px-3 py-2 text-muted-foreground">{teamName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{v.scheduled_start_time}</td>
                        <td className="px-3 py-2 text-right">
                          {heavy ? (
                            <Badge variant="outline" className="border-orange-500 text-orange-600 text-[10px]">
                              <AlertTriangle className="h-3 w-3 mr-1" /> heavy day ({preview.meta[i].team_day_count})
                            </Badge>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {heavyCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {heavyCount} day{heavyCount === 1 ? "" : "s"} will push {teamName} over {TEAM_DAY_WARNING_THRESHOLD} visits. You can still schedule — capacity is a warning only.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCommit} disabled={saving || loading || preview.visits.length === 0}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> : `Create ${preview.visits.length} visit${preview.visits.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}