import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { CalendarOff, Plus, Trash2, Pencil, CalendarIcon, Sun, Umbrella } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useWorkdays } from "@/hooks/useWorkdays";
import { toast } from "sonner";
import { format, parseISO, addDays, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

interface Props {
  tenantId: string | null;
}

type DayType = "bank_holiday" | "blocked" | "vacation";

interface UnifiedEntry {
  id: string;
  date: string;
  name: string;
  type: DayType;
  source: "global" | "tenant";
}

const typeLabel: Record<DayType, string> = {
  bank_holiday: "Bank Holiday",
  blocked: "Blocked",
  vacation: "Vacation",
};

const typeBadgeClass: Record<DayType, string> = {
  bank_holiday: "bg-destructive/10 text-destructive border-destructive/20",
  blocked: "bg-warning/15 text-warning border-warning/30",
  vacation: "bg-info/10 text-info border-info/20",
};

const typeIcon: Record<DayType, React.ReactNode> = {
  bank_holiday: <Sun className="h-3.5 w-3.5" />,
  blocked: <CalendarOff className="h-3.5 w-3.5" />,
  vacation: <Umbrella className="h-3.5 w-3.5" />,
};

export default function NonWorkdayManager({ tenantId }: Props) {
  const {
    holidays, tenantNonWorkdays, loading,
    addNonWorkday, removeNonWorkday, updateNonWorkday,
    addGlobalHoliday, updateGlobalHoliday, removeGlobalHoliday,
  } = useWorkdays(tenantId);

  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<UnifiedEntry | null>(null);
  const [formDate, setFormDate] = useState<Date | undefined>();
  const [formDateRange, setFormDateRange] = useState<DateRange | undefined>();
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState<DayType>("blocked");
  const [useRange, setUseRange] = useState(false);
  const [saving, setSaving] = useState(false);

  // Build unified list sorted by date
  const currentYear = new Date().getFullYear();
  const entries: UnifiedEntry[] = [
    ...holidays
      .filter(h => parseInt(h.date.split("-")[0]) >= currentYear)
      .map(h => ({
        id: h.id,
        date: h.date,
        name: h.name,
        type: "bank_holiday" as DayType,
        source: "global" as const,
      })),
    ...tenantNonWorkdays.map(d => {
      let type: DayType = "blocked";
      if (d.title.startsWith("[vacation]")) type = "vacation";
      else if (d.title.startsWith("[bank_holiday]")) type = "bank_holiday";
      return {
        id: d.id,
        date: d.date,
        name: d.title.replace(/^\[(vacation|bank_holiday|blocked)\]\s*/, ""),
        type,
        source: "tenant" as const,
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Calendar modifiers
  const holidayDates = holidays.map(h => parseISO(h.date));
  const blockedDates = tenantNonWorkdays.map(d => parseISO(d.date));

  const openAdd = () => {
    setEditingEntry(null);
    setFormDate(undefined);
    setFormDateRange(undefined);
    setFormTitle("");
    setFormType("blocked");
    setUseRange(false);
    setDialogOpen(true);
  };

  const openEdit = (entry: UnifiedEntry) => {
    setEditingEntry(entry);
    setFormDate(parseISO(entry.date));
    setFormDateRange(undefined);
    setFormTitle(entry.name);
    setFormType(entry.type);
    setUseRange(false);
    setDialogOpen(true);
  };

  const buildStoredTitle = (type: DayType, title: string) => {
    return type === "blocked" ? title : `[${type}] ${title}`;
  };

  const handleSave = async () => {
    if (!formTitle.trim()) {
      toast.error("Please provide a title");
      return;
    }

    // Range mode (create only)
    if (useRange && !editingEntry) {
      if (!formDateRange?.from) {
        toast.error("Please select a start date");
        return;
      }
      const from = formDateRange.from;
      const to = formDateRange.to || from;
      const days = differenceInDays(to, from) + 1;
      if (days > 60) {
        toast.error("Range too large (max 60 days)");
        return;
      }
      setSaving(true);
      const storedTitle = buildStoredTitle(formType, formTitle.trim());
      let created = 0;
      let skipped = 0;
      for (let i = 0; i < days; i++) {
        const d = addDays(from, i);
        const dateStr = format(d, "yyyy-MM-dd");
        try {
          if (formType === "bank_holiday") {
            await addGlobalHoliday(dateStr, formTitle.trim());
          } else {
            await addNonWorkday(dateStr, storedTitle);
          }
          created++;
        } catch (e: any) {
          if (e?.code === "23505") skipped++;
          else { toast.error("Failed to save some entries"); break; }
        }
      }
      toast.success(`Added ${created} day${created !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped, already exist)` : ""}`);
      setDialogOpen(false);
      setSaving(false);
      return;
    }

    // Single date mode
    if (!formDate) {
      toast.error("Please select a date");
      return;
    }
    setSaving(true);
    const dateStr = format(formDate, "yyyy-MM-dd");
    const storedTitle = buildStoredTitle(formType, formTitle.trim());

    try {
      if (editingEntry) {
        if (editingEntry.source === "global") {
          await updateGlobalHoliday(editingEntry.id, dateStr, formTitle.trim());
        } else {
          await updateNonWorkday(editingEntry.id, dateStr, storedTitle);
        }
        toast.success("Entry updated");
      } else {
        if (formType === "bank_holiday") {
          await addGlobalHoliday(dateStr, formTitle.trim());
        } else {
          await addNonWorkday(dateStr, storedTitle);
        }
        toast.success("Non-workday added");
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "This date is already blocked" : "Failed to save");
    }
    setSaving(false);
  };

  const handleRemove = async (entry: UnifiedEntry) => {
    try {
      if (entry.source === "global") {
        await removeGlobalHoliday(entry.id);
      } else {
        await removeNonWorkday(entry.id);
      }
      toast.success("Entry removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const navigateToDate = (dateStr: string) => {
    setCalendarMonth(parseISO(dateStr));
  };

  const fmtDate = (d: string) => {
    try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
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
                Manage holidays, vacations and blocked days. These dates are excluded from service visit scheduling.
              </CardDescription>
            </div>
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1 h-4 w-4" /> Add Day
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Calendar */}
          <div className="flex-shrink-0">
            <Calendar
              mode="single"
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              className={cn("p-3 pointer-events-auto rounded-md border")}
              modifiers={{
                holiday: holidayDates,
                blocked: blockedDates,
                sunday: (date) => date.getDay() === 0,
              }}
              modifiersClassNames={{
                holiday: "bg-destructive/15 text-destructive font-semibold",
                blocked: "bg-warning/20 font-semibold ring-1 ring-warning/50",
                sunday: "text-muted-foreground opacity-50",
              }}
            />
            <div className="flex items-center gap-4 mt-3 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-destructive/15 border border-destructive/30" /> Bank Holiday
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-warning/20 ring-1 ring-warning/50" /> Blocked / Vacation
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm bg-muted" /> Sunday
              </span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 min-w-0">
            <div className="rounded-md border max-h-[420px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No holidays or blocked days configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {entries.map((entry, idx) => (
                    <TableRow
                      key={`${entry.source}-${entry.id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigateToDate(entry.date)}
                    >
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-mono whitespace-nowrap">{fmtDate(entry.date)}</TableCell>
                      <TableCell className="text-sm">{entry.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("text-[10px] gap-1", typeBadgeClass[entry.type])}>
                          {typeIcon[entry.type]}
                          {typeLabel[entry.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(entry)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEntry ? "Edit Entry" : "Add Non-Workday"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={formType} onValueChange={v => setFormType(v as DayType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_holiday">Bank Holiday</SelectItem>
                    <SelectItem value="blocked">Blocked Day</SelectItem>
                    <SelectItem value="vacation">Vacation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date range toggle (only for new entries) */}
              {!editingEntry && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Date range</Label>
                  <Button
                    type="button"
                    variant={useRange ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setUseRange(!useRange);
                      setFormDate(undefined);
                      setFormDateRange(undefined);
                    }}
                  >
                    {useRange ? "Range ON" : "Single day"}
                  </Button>
                </div>
              )}

              {/* Single date picker */}
              {(!useRange || editingEntry) && (
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formDate ? format(formDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formDate}
                        onSelect={setFormDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Date range picker */}
              {useRange && !editingEntry && (
                <div className="space-y-2">
                  <Label>Date Range</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("w-full justify-start text-left font-normal", !formDateRange?.from && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formDateRange?.from ? (
                          formDateRange.to ? (
                            `${format(formDateRange.from, "MMM d")} – ${format(formDateRange.to, "MMM d, yyyy")}`
                          ) : (
                            format(formDateRange.from, "PPP")
                          )
                        ) : "Pick a date range"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="range"
                        selected={formDateRange}
                        onSelect={setFormDateRange}
                        numberOfMonths={2}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  {formDateRange?.from && formDateRange?.to && (
                    <p className="text-xs text-muted-foreground">
                      {differenceInDays(formDateRange.to, formDateRange.from) + 1} days selected
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Orthodox Easter, Team Retreat"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !formTitle.trim() || (useRange && !editingEntry ? !formDateRange?.from : !formDate)}
              >
                {saving ? "Saving…" : editingEntry ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
