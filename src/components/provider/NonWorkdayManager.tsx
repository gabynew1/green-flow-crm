import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { CalendarOff, Plus, Trash2, Sun, CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useWorkdays } from "@/hooks/useWorkdays";
import { toast } from "sonner";
import { format, parseISO, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  tenantId: string | null;
}

export default function NonWorkdayManager({ tenantId }: Props) {
  const { holidays, tenantNonWorkdays, loading, addNonWorkday, removeNonWorkday } = useWorkdays(tenantId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const currentYear = new Date().getFullYear();
  const upcomingHolidays = holidays.filter(h => parseInt(h.date.split("-")[0]) >= currentYear);

  // Build sets for calendar modifiers
  const holidayDates = holidays.map(h => parseISO(h.date));
  const blockedDates = tenantNonWorkdays.map(d => parseISO(d.date));

  const handleAdd = async () => {
    if (!newDate || !newTitle.trim()) {
      toast.error("Please provide a date and title");
      return;
    }
    setSaving(true);
    try {
      await addNonWorkday(format(newDate, "yyyy-MM-dd"), newTitle.trim());
      toast.success("Non-workday added");
      setNewDate(undefined);
      setNewTitle("");
      setDialogOpen(false);
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("This date is already blocked");
      } else {
        toast.error("Failed to add non-workday");
      }
    }
    setSaving(false);
  };

  const handleRemove = async (id: string) => {
    try {
      await removeNonWorkday(id);
      toast.success("Non-workday removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const formatDateStr = (d: string) => {
    try {
      return format(parseISO(d), "EEE, MMM d, yyyy");
    } catch {
      return d;
    }
  };

  // Get label for a date (holiday or custom)
  const getLabelForDate = (date: Date): string | null => {
    const dateStr = format(date, "yyyy-MM-dd");
    const holiday = holidays.find(h => h.date === dateStr);
    if (holiday) return holiday.name;
    const custom = tenantNonWorkdays.find(d => d.date === dateStr);
    if (custom) return custom.title;
    return null;
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Workday / Holiday</CardTitle>
              <CardDescription className="mt-1">
                Manage bank holidays and blocked days. These dates cannot be used for scheduling service visits.
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Calendar preview with highlighted non-workdays */}
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-shrink-0">
            <Calendar
              mode="single"
              className={cn("p-3 pointer-events-auto rounded-md border")}
              modifiers={{
                holiday: holidayDates,
                blocked: blockedDates,
                sunday: (date) => date.getDay() === 0,
              }}
              modifiersClassNames={{
                holiday: "bg-destructive/15 text-destructive font-semibold",
                blocked: "bg-warning/20 text-warning-foreground font-semibold ring-1 ring-warning/50",
                sunday: "text-muted-foreground opacity-50",
              }}
              onDayClick={(date) => {
                const label = getLabelForDate(date);
                if (label) {
                  toast.info(label, { description: format(date, "EEEE, MMMM d, yyyy") });
                }
              }}
            />
            <div className="flex items-center gap-4 mt-3 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-destructive/15 border border-destructive/30" /> Bank Holiday
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-warning/20 ring-1 ring-warning/50" /> Custom Blocked
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-muted" /> Sunday
              </span>
            </div>
          </div>

          {/* Right panel: lists */}
          <div className="flex-1 space-y-5 min-w-0">
            {/* Add button + custom blocked days */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Custom Blocked Days</p>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1 h-4 w-4" /> Block a Day
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Block a Workday</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal",
                                !newDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {newDate ? format(newDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={newDate}
                              onSelect={setNewDate}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          value={newTitle}
                          onChange={e => setNewTitle(e.target.value)}
                          placeholder="e.g. Orthodox Easter, Company Day Off"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAdd} disabled={saving || !newDate || !newTitle.trim()}>
                        {saving ? "Adding…" : "Block Day"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {tenantNonWorkdays.length > 0 ? (
                <div className="space-y-1.5">
                  {tenantNonWorkdays.map(d => (
                    <div key={d.id} className="flex items-center justify-between rounded-lg border p-2.5 px-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <CalendarOff className="h-4 w-4 text-warning flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{d.title}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{formatDateStr(d.date)}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => handleRemove(d.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">No custom blocked days yet. Use the button above to block specific dates from scheduling.</p>
              )}
            </div>

            {/* Bank holidays */}
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-destructive" /> Bank Holidays (Romania)
              </p>
              <div className="grid gap-1 max-h-[200px] overflow-y-auto rounded-md border p-2">
                {upcomingHolidays.map(h => (
                  <div key={h.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50 text-sm">
                    <Badge variant="outline" className="text-[10px] font-mono flex-shrink-0">
                      {formatDateStr(h.date)}
                    </Badge>
                    <span className="truncate">{h.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
