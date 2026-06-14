import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
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
  const [date, setDate] = useState<Date | undefined>(currentDate ? new Date(currentDate) : undefined);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!date) return;
    setSaving(true);
    const iso = format(date, "yyyy-MM-dd");
    const { error } = await supabase.from("service_orders").update({ scheduled_date: iso }).eq("id", visitId);
    setSaving(false);
    if (error) {
      toast.error("Failed to reschedule: " + error.message);
      return;
    }
    toast.success(`Visit rescheduled to ${format(date, "MMM d, yyyy")}`);
    setOpen(false);
    await onRescheduled();
  };

  return (
    <div
      className="px-1"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
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