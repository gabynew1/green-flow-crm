import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import RescheduleVisitButton from "@/components/provider/RescheduleVisitButton";
import { ZoneChip } from "@/components/provider/ZoneChip";
import { visitStatusColor, visitStatusLabel } from "@/lib/visit-status";

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
  allowQuickCancel = true,
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

  const showCancel = allowQuickCancel && (kind === "overdue" || active);

  const handleCancel = async () => {
    const prevStatus = o.status;
    const { error } = await supabase
      .from("service_orders")
      .update({ status: "CANCELED", cancel_reason: kind === "overdue" ? "Dismissed as overdue" : "Canceled from list" })
      .eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Visit canceled", {
      action: {
        label: "Undo",
        onClick: async () => {
          await supabase.from("service_orders").update({ status: prevStatus, cancel_reason: null }).eq("id", o.id);
          onChanged();
        },
      },
      duration: 10000,
    });
    onChanged();
  };

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
          {active && (
            <RescheduleVisitButton visitId={o.id} currentDate={o.scheduled_date} onRescheduled={onChanged} />
          )}
          {showCancel && active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Cancel visit">
                  <XCircle className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this visit?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It will be marked CANCELED and removed from the schedule. You can undo right after.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel}>Cancel visit</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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