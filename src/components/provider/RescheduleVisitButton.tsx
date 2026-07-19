import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  visitId: string;
  currentDate: string | null;
  onRescheduled: () => void | Promise<void>;
  disabled?: boolean;
}

export default function RescheduleVisitButton({ visitId, currentDate, onRescheduled, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(currentDate ? parseISO(currentDate) : undefined);
  const [saving, setSaving] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<any[] | null>(null);
  const queryClient = useQueryClient();

  const commitReschedule = async (iso: string) => {
    setSaving(true);
    const { error } = await supabase.from("service_orders").update({ scheduled_date: iso }).eq("id", visitId);
    setSaving(false);
    if (error) {
      toast.error("Failed to reschedule: " + error.message);
      return;
    }
    toast.success(`Rescheduled to ${format(parseISO(iso), "MMM d, yyyy")}`);
    setOpen(false);
    setPendingConflicts(null);
    queryClient.invalidateQueries({ queryKey: ["zone-date-map"] });
    await onRescheduled();
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!date) return;
    const iso = format(date, "yyyy-MM-dd");

    setSaving(true);
    // Scope check: same team, same date, non-canceled visits.
    const { data: current } = await supabase
      .from("service_orders")
      .select("property_id, team_id")
      .eq("id", visitId)
      .maybeSingle();

    let conflicts: any[] = [];
    if (current?.team_id) {
      const { data } = await supabase
        .from("service_orders")
        .select("id, period_label, properties(name), teams(name)")
        .eq("team_id", current.team_id)
        .eq("scheduled_date", iso)
        .neq("id", visitId)
        .not("status", "in", "(CANCELED)");
      conflicts = data ?? [];
    }
    setSaving(false);

    if (conflicts.length > 0) {
      // Block; require explicit confirm.
      setPendingConflicts(conflicts);
      return;
    }

    await commitReschedule(iso);
  };

  return (
    <div
      className="px-1"
      onClick={(e) => e.stopPropagation()}
    >
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPendingConflicts(null); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          title="Reschedule"
        >
          <CalendarClock className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => { setDate(d); setPendingConflicts(null); }}
          initialFocus
          className="p-3 pointer-events-auto"
        />
        {pendingConflicts && pendingConflicts.length > 0 && (
          <div className="border-t bg-warning/5 p-3 space-y-2 max-w-[280px]">
            <div className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-xs font-semibold">Slot conflict</p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {(pendingConflicts[0] as any)?.teams?.name || "This team"} already has{" "}
              {pendingConflicts.length} visit{pendingConflicts.length > 1 ? "s" : ""} on this date:
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-0.5">
              {pendingConflicts.slice(0, 4).map((c: any) => (
                <li key={c.id}>• {c.period_label || c.properties?.name || c.id}</li>
              ))}
              {pendingConflicts.length > 4 && <li>• …and {pendingConflicts.length - 4} more</li>}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2 p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); setPendingConflicts(null); }}
          >
            Cancel
          </Button>
          {pendingConflicts && pendingConflicts.length > 0 ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (date) commitReschedule(format(date, "yyyy-MM-dd")); }}
              disabled={!date || saving}
            >
              Reschedule anyway
            </Button>
          ) : (
            <Button size="sm" onClick={handleConfirm} disabled={!date || saving}>OK</Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
    </div>
  );
}