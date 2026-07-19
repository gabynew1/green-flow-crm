import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarClock } from "lucide-react";
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
  const queryClient = useQueryClient();

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!date) return;
    setSaving(true);
    const iso = format(date, "yyyy-MM-dd");

    // Look up this visit's tenant/property/team for conflict scoping.
    const { data: current } = await supabase
      .from("service_orders")
      .select("property_id, team_id")
      .eq("id", visitId)
      .maybeSingle();

    const { error } = await supabase.from("service_orders").update({ scheduled_date: iso }).eq("id", visitId);
    if (error) {
      setSaving(false);
      toast.error("Failed to reschedule: " + error.message);
      return;
    }

    // Non-blocking conflict notice: any other non-canceled visit on same
    // team/property/date.
    let conflicts: any[] = [];
    if (current?.team_id && current?.property_id) {
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
    setOpen(false);

    const prettyDate = format(date, "MMM d, yyyy");
    if (conflicts.length > 0) {
      const teamName = (conflicts[0] as any)?.teams?.name ?? "aceeași echipă";
      const descLines = conflicts
        .slice(0, 4)
        .map((c: any) => `• ${c.period_label || c.properties?.name || c.id}`)
        .join("\n");
      const more = conflicts.length > 4 ? `\n…și încă ${conflicts.length - 4}` : "";
      toast.warning(`Vizită reprogramată pe ${prettyDate}`, {
        description: `Atenție: mai există ${conflicts.length} vizită(e) programate pentru ${teamName} în acea zi.\n${descLines}${more}`,
      });
    } else {
      toast.success(`Vizită reprogramată pe ${prettyDate}`);
    }

    queryClient.invalidateQueries({ queryKey: ["zone-date-map"] });
    await onRescheduled();
  };

  return (
    <div
      className="px-1"
      onClick={(e) => e.stopPropagation()}
    >
    <Popover open={open} onOpenChange={setOpen}>
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
        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
        <div className="flex justify-end gap-2 p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!date || saving}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
    </div>
  );
}