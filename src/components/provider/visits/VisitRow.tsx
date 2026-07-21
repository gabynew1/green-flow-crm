import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ZoneChip } from "@/components/provider/ZoneChip";
import { visitStatusColor, visitStatusLabel } from "@/lib/visit-status";
import { VisitActionRow } from "@/components/visits/VisitActionRow";

export type VisitRowKind = "overdue" | "upcoming" | "past" | "neutral";

export interface VisitRowProps {
  visit: any;
  kind?: VisitRowKind;
  showTeamColor?: boolean;
  showCustomerName?: boolean;
  showAutoManual?: boolean;
  allowQuickCancel?: boolean;
  onChanged: () => void;
}

const formatTimeSlot = (start: string | null, end: string | null) => {
  if (!start) return null;
  return `${start.slice(0, 5)}–${end?.slice(0, 5) || ""}`;
};

/**
 * Canonical visit row used everywhere a visit is listed. Change once, it
 * updates in every location (Service Visits page, customer detail, etc.).
 */
export function VisitRow({
  visit: o,
  kind = "neutral",
  showTeamColor = false,
  showCustomerName = false,
  showAutoManual = true,
  allowQuickCancel = true, // kept for API compat — action row already gates by status
  onChanged,
}: VisitRowProps) {
  const navigate = useNavigate();

  const active = o.status !== "COMPLETED" && o.status !== "CANCELED";
  const scheduled = o.scheduled_date ? format(new Date(o.scheduled_date), "MMM d, yyyy") : "Unscheduled";
  const labelDateMatch = (o.period_label || "").match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
  const originalDate = labelDateMatch?.[1];
  const wasRescheduled = !!originalDate && originalDate !== scheduled;

  const teamColor: string | undefined = (o.teams as any)?.color;
  const teamName: string | undefined = (o.teams as any)?.name;
  const timeSlot = formatTimeSlot(o.scheduled_start_time, o.scheduled_end_time);

  const propertyName = (o.properties as any)?.name;
  const customerName = (o.properties as any)?.customers?.name;
  const zone = (o.properties as any)?.service_zones;

  return (
    <Card
      className={`hover:border-primary/50 transition-colors ${kind === "overdue" ? "border-l-4 border-l-destructive" : ""}`}
      style={showTeamColor && teamColor && kind !== "overdue" ? { borderLeftColor: teamColor, borderLeftWidth: 4 } : undefined}
    >
      <CardContent className="pt-4 pb-4 flex items-center justify-between gap-3">
        <div
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
          onClick={() => navigate(`/provider/visits/${o.id}`)}
        >
          {showTeamColor && teamColor && (
            <div className="h-5 w-5 rounded-full shrink-0" style={{ backgroundColor: teamColor }} title={teamName} />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium truncate">{propertyName || scheduled}</p>
              {showAutoManual && (
                o.contract_id && !o.created_by_user_id ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Auto</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Manual</Badge>
                )
              )}
              <ZoneChip name={zone?.name} color={zone?.color} />
              {kind === "overdue" && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-[10px]">
                  Overdue
                </Badge>
              )}
              {wasRescheduled && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 text-[10px]">
                  Rescheduled from {originalDate}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {showCustomerName && customerName && <span>{customerName} · </span>}
              <span>{scheduled}</span>
              {timeSlot && <span> · {timeSlot}</span>}
              {o.period_label && !wasRescheduled && <span> · {o.period_label}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <VisitActionRow visit={o} size="sm" layout="row" onChanged={onChanged} />
          {o.needs_client_action && (
            <Badge variant="outline" className="text-[10px] border-warning text-warning">Needs review</Badge>
          )}
          <Badge className={visitStatusColor(o.status)} variant="secondary">
            {visitStatusLabel(o.status)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default VisitRow;