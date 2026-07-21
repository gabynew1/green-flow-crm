import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendAppEmail } from "@/lib/send-app-email";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import {
  CalendarClock,
  CheckCircle2,
  LogIn,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import CreateAdHocVisitDialog from "@/components/provider/CreateAdHocVisitDialog";
import { TEAM_DAY_WARNING_THRESHOLD } from "@/lib/scheduling-constants";

export interface VisitActionRowVisit {
  id: string;
  status: string;
  scheduled_date: string | null;
  scheduled_start_time?: string | null;
  scheduled_end_time?: string | null;
  property_id?: string | null;
  customer_id?: string | null;
  contract_id?: string | null;
  tenant_id?: string | null;
  team_id?: string | null;
  properties?: {
    name?: string;
    tenant_id?: string;
    customers?: { id?: string; name?: string };
  } | null;
}

interface Props {
  visit: VisitActionRowVisit;
  onChanged: () => void | Promise<void>;
  /** Provided by pages that own a Complete-and-send-report flow (VisitDetail). */
  onComplete?: () => void;
  size?: "sm" | "default";
  /** `row` = compact icon buttons for lists; `detail` = full labeled buttons. */
  layout?: "row" | "detail";
}

/**
 * Single source of truth for visit state transitions.
 * Buttons are rendered contextually by status:
 *   SCHEDULED    → Check-In · Reschedule · Complete · Cancel
 *   IN_PROGRESS  → Complete · Cancel
 *   CANCELED     → Rebook · Delete
 *   COMPLETED    → (nothing)
 */
export function VisitActionRow({
  visit,
  onChanged,
  onComplete,
  size = "default",
  layout = "detail",
}: Props) {
  const navigate = useNavigate();
  const isCompact = layout === "row";
  const btnSize = size;

  const status = visit.status;
  const isScheduled = status === "SCHEDULED";
  const isInProgress = status === "IN_PROGRESS";
  const isCanceled = status === "CANCELED";
  // COMPLETED is terminal → render nothing.
  if (status === "COMPLETED") return null;

  // ─── Reschedule popover ──────────────────────────────────────────────
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    visit.scheduled_date ? parseISO(visit.scheduled_date) : undefined,
  );
  const [savingReschedule, setSavingReschedule] = useState(false);

  const doReschedule = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!rescheduleDate) return;
    const iso = format(rescheduleDate, "yyyy-MM-dd");
    setSavingReschedule(true);

    // Soft capacity warning
    let heavyLabel: string | null = null;
    if (visit.team_id) {
      const { count } = await supabase
        .from("service_orders")
        .select("id", { count: "exact", head: true })
        .eq("team_id", visit.team_id)
        .eq("scheduled_date", iso)
        .neq("id", visit.id)
        .not("status", "in", "(CANCELED)");
      const next = (count ?? 0) + 1;
      if (next > TEAM_DAY_WARNING_THRESHOLD) {
        heavyLabel = `Team now has ${next} visits on ${format(parseISO(iso), "MMM d")}`;
      }
    }

    const { error } = await supabase
      .from("service_orders")
      .update({ scheduled_date: iso })
      .eq("id", visit.id);
    setSavingReschedule(false);
    if (error) {
      toast.error("Failed to reschedule: " + error.message);
      return;
    }
    heavyLabel
      ? toast.warning(heavyLabel, { description: "Capacity warning — reschedule went through." })
      : toast.success(`Rescheduled to ${format(parseISO(iso), "MMM d, yyyy")}`);
    setRescheduleOpen(false);
    await onChanged();
  };

  // ─── Check-In ────────────────────────────────────────────────────────
  const [checkingIn, setCheckingIn] = useState(false);
  const doCheckIn = async () => {
    setCheckingIn(true);
    const { error } = await supabase
      .from("service_orders")
      .update({ status: "IN_PROGRESS", checked_in_at: new Date().toISOString() } as any)
      .eq("id", visit.id);
    if (error) {
      setCheckingIn(false);
      toast.error(error.message);
      return;
    }

    // Notify client (fire-and-forget)
    try {
      const customerId = visit.properties?.customers?.id;
      const propertyTenantId = visit.properties?.tenant_id ?? visit.tenant_id ?? null;
      if (customerId) {
        const { data: clientProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("customer_id", customerId)
          .maybeSingle();
        const { data: tenant } = propertyTenantId
          ? await supabase.from("tenants").select("name").eq("id", propertyTenantId).single()
          : { data: null as any };
        if (clientProfile?.email) {
          sendAppEmail({
            templateName: "visit-checkin",
            recipientEmail: clientProfile.email,
            idempotencyKey: `visit-checkin-${visit.id}`,
            tenantId: propertyTenantId,
            templateData: {
              propertyName: visit.properties?.name,
              providerName: tenant?.name,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    } catch { /* swallow — email is non-blocking */ }

    setCheckingIn(false);
    toast.success("Checked in — client notified");
    await onChanged();
  };

  // ─── Cancel with reason ──────────────────────────────────────────────
  const [cancelReason, setCancelReason] = useState("");
  const doCancel = async () => {
    const prevStatus = status;
    const reason = cancelReason.trim() || "Canceled by provider";
    const { error } = await supabase
      .from("service_orders")
      .update({ status: "CANCELED", cancel_reason: reason } as any)
      .eq("id", visit.id);
    if (error) return toast.error(error.message);
    setCancelReason("");
    toast.success("Visit canceled", {
      action: {
        label: "Undo",
        onClick: async () => {
          await supabase
            .from("service_orders")
            .update({ status: prevStatus, cancel_reason: null } as any)
            .eq("id", visit.id);
          onChanged();
        },
      },
      duration: 10000,
    });
    await onChanged();
  };

  // ─── Delete (only for CANCELED) ──────────────────────────────────────
  const doDelete = async () => {
    await supabase.from("service_order_items").delete().eq("service_order_id", visit.id);
    const { error } = await supabase.from("service_orders").delete().eq("id", visit.id);
    if (error) return toast.error(error.message);
    toast.success("Visit deleted");
    await onChanged();
  };

  // ─── Rebook (only for CANCELED) ──────────────────────────────────────
  const [rebookOpen, setRebookOpen] = useState(false);

  // ─── Render ──────────────────────────────────────────────────────────
  return (
    <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
      {isScheduled && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            {isCompact ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary" title="Check in">
                <LogIn className="h-4 w-4" />
              </Button>
            ) : (
              <Button size={btnSize} className="gap-2">
                <LogIn className="h-4 w-4" /> Check-In
              </Button>
            )}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm check-in?</AlertDialogTitle>
              <AlertDialogDescription>
                This marks the visit as In Progress and notifies the client that you have arrived.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={doCheckIn} disabled={checkingIn}>
                <LogIn className="h-4 w-4 mr-2" /> Confirm check-in
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isScheduled && (
        <Popover open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <PopoverTrigger asChild>
            {isCompact ? (
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Reschedule">
                <CalendarClock className="h-4 w-4" />
              </Button>
            ) : (
              <Button size={btnSize} variant="outline" className="gap-2">
                <CalendarClock className="h-4 w-4" /> Reschedule
              </Button>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
            <Calendar
              mode="single"
              selected={rescheduleDate}
              onSelect={(d) => setRescheduleDate(d)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
            <div className="flex justify-end gap-2 p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRescheduleOpen(false); }}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={doReschedule} disabled={!rescheduleDate || savingReschedule}>OK</Button>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {(isScheduled || isInProgress) && onComplete && !isCompact && (
        <Button size={btnSize} variant="outline" className="gap-2" onClick={onComplete}>
          <CheckCircle2 className="h-4 w-4" /> Complete
        </Button>
      )}

      {(isScheduled || isInProgress) && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            {isCompact ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Cancel visit">
                <XCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button size={btnSize} variant="outline" className="gap-2 text-destructive hover:text-destructive">
                <XCircle className="h-4 w-4" /> Cancel Visit
              </Button>
            )}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this visit?</AlertDialogTitle>
              <AlertDialogDescription>
                Give a short reason so the schedule stays clear. You can undo right after.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Canceled by provider"
                rows={3}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={doCancel}>Cancel visit</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isCanceled && (
        <>
          {isCompact ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-primary hover:text-primary"
              title="Rebook"
              onClick={() => setRebookOpen(true)}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          ) : (
            <Button size={btnSize} className="gap-2" onClick={() => setRebookOpen(true)}>
              <RotateCcw className="h-4 w-4" /> Rebook
            </Button>
          )}
          <CreateAdHocVisitDialog
            open={rebookOpen}
            onOpenChange={setRebookOpen}
            defaultCustomerId={visit.properties?.customers?.id || visit.customer_id || undefined}
            defaultPropertyId={visit.property_id || undefined}
            onCreated={(id) => {
              onChanged();
              if (id && !isCompact) navigate(`/provider/visits/${id}`);
            }}
          />
        </>
      )}

      {isCanceled && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            {isCompact ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete visit">
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button size={btnSize} variant="ghost" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Delete Visit
              </Button>
            )}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this visit permanently?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the visit and all its service items. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={doDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete permanently
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default VisitActionRow;