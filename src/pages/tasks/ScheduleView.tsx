import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ActionTaskRow } from "@/hooks/useActionTasks";

type ScheduledItem = {
  id: string;
  date: Date;
  title: string;
  property?: string | null;
  status: "pending" | "confirmed" | "completed";
  source: "task" | "inspection";
  task?: ActionTaskRow;
  inspectionId?: string;
};

interface Props {
  pendingTasks: ActionTaskRow[];
  onSelectTask: (t: ActionTaskRow) => void;
}

export default function ScheduleView({ pendingTasks, onSelectTask }: Props) {
  const { isClient, user } = useAuth();
  const [cursor, setCursor] = useState<Date>(new Date());
  const [confirmed, setConfirmed] = useState<ScheduledItem[]>([]);

  // Pull confirmed (SCHEDULED/COMPLETED) inspections the user can see via RLS.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("inspections")
        .select("id, title, inspected_date, status, properties(name)")
        .in("status", ["SCHEDULED", "COMPLETED"])
        .not("inspected_date", "is", null)
        .order("inspected_date", { ascending: true })
        .limit(200);
      if (cancelled) return;
      setConfirmed(
        (data ?? []).map((i: any) => ({
          id: `insp-${i.id}`,
          date: new Date(i.inspected_date),
          title: i.title || "Inspection",
          property: i.properties?.name,
          status: i.status === "COMPLETED" ? "completed" : "confirmed",
          source: "inspection" as const,
          inspectionId: i.id,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pendingItems = useMemo<ScheduledItem[]>(() => {
    return pendingTasks
      .filter((t) => t.task_type === "inspection_confirmation")
      .map((t) => {
        const dateStr = (t.payload as any)?.scheduled_date || t.due_at;
        if (!dateStr) return null;
        return {
          id: t.id,
          date: new Date(dateStr),
          title: (t.payload as any)?.title || "Inspection",
          property: (t.payload as any)?.property_name,
          status: "pending" as const,
          source: "task" as const,
          task: t,
        };
      })
      .filter(Boolean) as ScheduledItem[];
  }, [pendingTasks]);

  // Confirmed items take priority — if a task and its inspection both exist, show the
  // confirmed one. Pending items only appear when the inspection hasn't moved to SCHEDULED yet.
  const items = useMemo<ScheduledItem[]>(() => {
    const confirmedInspectionIds = new Set(confirmed.map((c) => c.inspectionId));
    const filteredPending = pendingItems.filter(
      (p) => !confirmedInspectionIds.has((p.task?.payload as any)?.inspection_id)
    );
    return [...confirmed, ...filteredPending];
  }, [confirmed, pendingItems]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) {
    days.push(new Date(d));
  }

  const itemsByDay = (day: Date) => items.filter((i) => isSameDay(i.date, day));

  const upcoming = useMemo(
    () =>
      [...items]
        .filter((i) => i.date.getTime() >= Date.now() - 86400000)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 8),
    [items]
  );

  const statusColor = (s: ScheduledItem["status"]) =>
    s === "pending"
      ? "bg-amber-500/15 text-amber-700 border-amber-500/40"
      : s === "confirmed"
      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">{format(cursor, "MMMM yyyy")}</h3>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setCursor((d) => addMonths(d, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCursor(new Date())}>
                Today
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setCursor((d) => addMonths(d, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="bg-muted px-2 py-1.5 text-center font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const inMonth = isSameMonth(day, cursor);
              const dayItems = itemsByDay(day);
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[88px] bg-background p-1.5",
                    !inMonth && "bg-muted/40 text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                      isToday && "bg-primary text-primary-foreground font-semibold"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="space-y-1">
                    {dayItems.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => item.task && onSelectTask(item.task)}
                        disabled={!item.task}
                        className={cn(
                          "block w-full truncate rounded border px-1.5 py-0.5 text-left text-[10px] leading-tight",
                          statusColor(item.status),
                          item.task && "hover:opacity-80 cursor-pointer"
                        )}
                        title={`${item.title}${item.property ? ` · ${item.property}` : ""}`}
                      >
                        {item.title}
                      </button>
                    ))}
                    {dayItems.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Awaiting confirmation
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Confirmed
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-muted-foreground" /> Completed
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 text-base font-semibold">Upcoming</h3>
          {upcoming.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No scheduled visits in the next weeks.
            </p>
          ) : (
            <ul className="space-y-2">
              {upcoming.map((item) => (
                <li
                  key={item.id}
                  onClick={() => item.task && onSelectTask(item.task)}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-md border bg-card p-2.5 text-sm",
                    item.task && "cursor-pointer hover:bg-accent/40"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.title}</p>
                    {item.property && (
                      <p className="truncate text-xs text-muted-foreground">{item.property}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {format(item.date, "EEE, MMM d, yyyy")}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 text-[10px]", statusColor(item.status))}>
                    {item.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {isClient && pendingItems.length > 0 && (
            <p className="mt-3 rounded-md bg-amber-500/10 p-2 text-[11px] text-amber-800">
              {pendingItems.length} inspection date(s) waiting for your confirmation. Click them on the calendar to respond.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}