import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, CalendarDays, List, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import CreateAdHocVisitDialog from "@/components/provider/CreateAdHocVisitDialog";
import { startOfWeek, endOfWeek, addDays, addWeeks, format, isSameDay, isToday, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useWorkdays } from "@/hooks/useWorkdays";

const statusColor: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-info/10 text-info",
  COMPLETED: "bg-primary/10 text-primary",
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-success/10 text-success",
  SENT_TO_CLIENT: "bg-accent/10 text-accent",
  CANCELED: "bg-destructive/10 text-destructive",
};

const statusLabels: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  SENT_TO_CLIENT: "Sent to Client",
  CANCELED: "Canceled",
};

export default function ServiceVisits() {
  const { tenantId } = useAuth();
  const { isWorkday, getNonWorkdayLabel } = useWorkdays(tenantId);
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await supabase
      .from("service_orders")
      .select("*, properties(name, customers(name))")
      .order("scheduled_date", { ascending: false });
    setOrders(data ?? []);
  };

  // List view filtering
  const filtered = orders.filter(o => {
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return (o.properties as any)?.name?.toLowerCase().includes(q) ||
      (o.properties as any)?.customers?.name?.toLowerCase().includes(q) ||
      o.period_label?.toLowerCase().includes(q);
  });

  // Calendar helpers
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getOrdersForDate = (date: Date) =>
    orders.filter(o => o.scheduled_date && isSameDay(parseISO(o.scheduled_date), date));

  const dayOrders = getOrdersForDate(selectedDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Service Visits</h1>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "calendar" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("calendar")}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Visit
          </Button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <>
          {/* Day navigation strip */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => addDays(d, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <p className="text-lg font-semibold">{format(selectedDate, "EEEE, MMMM d, yyyy")}</p>
              {isToday(selectedDate) && <Badge variant="secondary" className="mt-1">Today</Badge>}
            </div>
            <Button variant="outline" size="icon" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isToday(selectedDate) && (
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
                Today
              </Button>
            )}
          </div>

          {/* Day's visits */}
          <div className="space-y-2">
            {dayOrders.length > 0 ? dayOrders.map(o => (
              <Link key={o.id} to={`/provider/visits/${o.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{(o.properties as any)?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(o.properties as any)?.customers?.name} · {o.period_label || o.scheduled_date} · {o.period_type}
                      </p>
                    </div>
                    <Badge className={statusColor[o.status]} variant="secondary">
                      {statusLabels[o.status] || o.status.replace(/_/g, " ")}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            )) : (
              <p className="text-muted-foreground text-center py-4 text-sm">No visits for this day</p>
            )}
          </div>

          {/* Week grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(d => addWeeks(d, -1))}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous Week
              </Button>
              <p className="text-sm font-medium text-muted-foreground">
                {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSelectedDate(d => addWeeks(d, 1))}>
                Next Week <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1 min-h-[200px]">
                {weekDays.map(day => {
                  const dayVisits = getOrdersForDate(day);
                  const today = isToday(day);
                  const selected = isSameDay(day, selectedDate);
                  const workday = isWorkday(day);
                  const nonWorkLabel = getNonWorkdayLabel(day);
                  return (
                    <div
                      key={day.toISOString()}
                      className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                        selected ? "border-primary bg-primary/5" : today ? "border-primary/40 bg-primary/[0.02]" : !workday ? "border-border bg-muted/40" : "border-border"
                      }`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <div className="text-center mb-2">
                        <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
                        <p className={`text-sm font-semibold ${today ? "text-primary" : !workday ? "text-muted-foreground" : ""}`}>{format(day, "d")}</p>
                        {nonWorkLabel && <p className="text-[9px] text-destructive/70 truncate">{nonWorkLabel}</p>}
                      </div>
                    <div className="space-y-1">
                      {dayVisits.slice(0, 3).map(o => (
                        <Link key={o.id} to={`/provider/visits/${o.id}`} onClick={e => e.stopPropagation()}>
                          <div className={`rounded px-1.5 py-1 text-[10px] leading-tight truncate ${statusColor[o.status]}`}>
                            {(o.properties as any)?.name}
                          </div>
                        </Link>
                      ))}
                      {dayVisits.length > 3 && (
                        <p className="text-[10px] text-muted-foreground text-center">+{dayVisits.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* List view (original) */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="SENT_TO_CLIENT">Sent to Client</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filtered.map(o => (
              <Link key={o.id} to={`/provider/visits/${o.id}`}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{(o.properties as any)?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(o.properties as any)?.customers?.name} · {o.period_label || o.scheduled_date} · {o.period_type}
                      </p>
                    </div>
                    <Badge className={statusColor[o.status]} variant="secondary">{statusLabels[o.status] || o.status.replace(/_/g, " ")}</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">No service visits found</p>}
          </div>
        </>
      )}

      <CreateAdHocVisitDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}
