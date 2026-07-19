import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, CalendarDays, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import CreateAdHocVisitDialog from "@/components/provider/CreateAdHocVisitDialog";
import { ZoneChip } from "@/components/provider/ZoneChip";
import { VisitRow } from "@/components/provider/visits/VisitRow";
import { startOfWeek, addDays, addWeeks, addMonths, startOfMonth, endOfMonth, endOfWeek, eachDayOfInterval, isSameMonth, format, isSameDay, isToday, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useWorkdays } from "@/hooks/useWorkdays";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { visitStatusColor as statusColor, visitStatusLabel as statusLabelFn } from "@/lib/visit-status";
import { TEAM_DAY_WARNING_THRESHOLD } from "@/lib/scheduling-constants";

interface Team {
  id: string;
  name: string;
  color: string;
}

export default function ServiceVisits() {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const { isWorkday, getNonWorkdayLabel } = useWorkdays(tenantId);
  const [orders, setOrders] = useState<any[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("month");
  const [cameFromMonth, setCameFromMonth] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState<string>("ALL");
  const [zoneFilter, setZoneFilter] = useState<string>("ALL");
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => { load(); loadTeams(); }, []);

  useRealtimeRefresh(["service_orders"], () => { load(); }, tenantId);

  const load = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("service_orders")
      .select("*, properties(name, customers(name), service_zones(id, name, color)), teams(id, name, color)")
      .eq("tenant_id", tenantId)
      .order("scheduled_date", { ascending: true });;
    setOrders(data ?? []);
  };

  const loadTeams = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("teams").select("id, name, color").eq("tenant_id", tenantId!).order("created_at");
    setTeams(data ?? []);
  };

  const teamColorMap = Object.fromEntries(teams.map(t => [t.id, t.color]));

  // Filter by team + property
  const teamFiltered = orders.filter(o => {
    if (teamFilter !== "ALL" && o.team_id !== teamFilter) return false;
    if (propertyFilter !== "ALL" && o.property_id !== propertyFilter) return false;
    if (zoneFilter !== "ALL") {
      const zid = (o.properties as any)?.service_zones?.id ?? null;
      if (zoneFilter === "NONE") { if (zid) return false; }
      else if (zid !== zoneFilter) return false;
    }
    return true;
  });

  // Unique properties list from loaded orders
  const propertyOptions = Array.from(
    new Map(
      orders
        .filter(o => o.property_id && (o.properties as any)?.name)
        .map(o => [o.property_id as string, (o.properties as any).name as string]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Unique zones list from loaded orders
  const zoneOptions = Array.from(
    new Map(
      orders
        .map(o => (o.properties as any)?.service_zones)
        .filter((z: any) => z && z.id)
        .map((z: any) => [z.id as string, { name: z.name as string, color: z.color as string }]),
    ).entries(),
  ).sort((a, b) => a[1].name.localeCompare(b[1].name));

  // Calendar placement: completed visits surface on their performed date,
  // everything else on scheduled date. scheduled_date is never overwritten.
  const visitDisplayDate = (o: any): Date | null => {
    if (o.status === "COMPLETED" && o.performed_date) return parseISO(o.performed_date);
    return o.scheduled_date ? parseISO(o.scheduled_date) : null;
  };

  // List view filtering
  const filtered = teamFiltered.filter(o => {
    if (statusFilter === "NEEDS_REVIEW") {
      if (!o.needs_client_action) return false;
    } else if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return (o.properties as any)?.name?.toLowerCase().includes(q) ||
      (o.properties as any)?.customers?.name?.toLowerCase().includes(q) ||
      o.period_label?.toLowerCase().includes(q);
  });

  // Calendar helpers
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Month grid days (full weeks)
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: monthGridStart, end: monthGridEnd });

  const getOrdersForDate = (date: Date) =>
    teamFiltered.filter(o => {
      const d = visitDisplayDate(o);
      return d && isSameDay(d, date);
    });

  const dayOrders = getOrdersForDate(selectedDate);

  // Slot occupancy for a day per team
  const getDaySlotInfo = (date: Date) => {
    const dateOrders = orders.filter(o => {
      const d = visitDisplayDate(o);
      return d && isSameDay(d, date);
    });
    const teamSlots: Record<string, number> = {};
    dateOrders.forEach(o => {
      if (o.team_id) teamSlots[o.team_id] = (teamSlots[o.team_id] || 0) + 1;
    });
    return teamSlots;
  };

  // A day is "overloaded" when ANY team on it exceeds the warning threshold.
  const isDayOverloaded = (date: Date): { overloaded: boolean; label: string } => {
    const slots = getDaySlotInfo(date);
    const heavy = Object.entries(slots).filter(([, c]) => c > TEAM_DAY_WARNING_THRESHOLD);
    if (heavy.length === 0) return { overloaded: false, label: "" };
    const label = heavy.map(([tid, c]) => {
      const t = teams.find(tm => tm.id === tid);
      return `${t?.name || "Team"}: ${c}`;
    }).join(" · ");
    return { overloaded: true, label };
  };

  const formatTimeSlot = (start: string | null, end: string | null) => {
    if (!start) return null;
    return `${start.slice(0, 5)}–${end?.slice(0, 5) || ""}`;
  };

  // Unified nav strip helpers
  const setView = (v: "day" | "week" | "month") => {
    setCameFromMonth(false);
    setCalendarView(v);
  };
  const stepBack = () => {
    if (calendarView === "day") setSelectedDate(d => addDays(d, -1));
    else if (calendarView === "week") setSelectedDate(d => addWeeks(d, -1));
    else setSelectedDate(d => addMonths(d, -1));
  };
  const stepForward = () => {
    if (calendarView === "day") setSelectedDate(d => addDays(d, 1));
    else if (calendarView === "week") setSelectedDate(d => addWeeks(d, 1));
    else setSelectedDate(d => addMonths(d, 1));
  };
  const zoomOut = () => {
    if (calendarView === "day") setView("week");
    else if (calendarView === "week") setView("month");
  };
  const zoomIn = () => {
    if (calendarView === "month") setView("week");
    else if (calendarView === "week") setView("day");
  };
  const periodLabel = calendarView === "day"
    ? format(selectedDate, "EEEE, MMMM d, yyyy")
    : calendarView === "week"
      ? `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "MMM d, yyyy")}`
      : format(selectedDate, "MMMM yyyy");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Service Visits</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Property filter */}
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Properties</SelectItem>
              {propertyOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Zone filter */}
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Zones</SelectItem>
              <SelectItem value="NONE">No zone</SelectItem>
              {zoneOptions.map(([id, z]) => (
                <SelectItem key={id} value={id}>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: z.color }} />
                    {z.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Team filter */}
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Teams</SelectItem>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {viewMode === "calendar" && (
            <Select value={calendarView} onValueChange={(v) => setView(v as any)}>
              <SelectTrigger className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          )}
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
          {/* Back to month (only when drilled in from month view) */}
          {calendarView === "day" && cameFromMonth && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setCameFromMonth(false); setCalendarView("month"); }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to month
            </Button>
          )}

          {/* Unified date-navigation strip */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={zoomOut}
              disabled={calendarView === "month"}
              title="Zoom out (day → week → month)"
            >
              <ChevronsLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 flex items-center justify-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={stepBack}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[220px]">
                <p className="text-lg font-semibold">{periodLabel}</p>
                {calendarView === "day" && (
                  <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
                    {isToday(selectedDate) && <Badge variant="secondary">Today</Badge>}
                    {(() => {
                      const slots = getDaySlotInfo(selectedDate);
                      const entries = Object.entries(slots);
                      if (entries.length === 0) return null;
                      return entries.map(([tid, count]) => {
                        const team = teams.find(t => t.id === tid);
                        return (
                          <Badge key={tid} variant="outline" className="text-[10px]">
                            <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: team?.color || "#888" }} />
                            {team?.name}: {count} visit{count === 1 ? "" : "s"}{count > TEAM_DAY_WARNING_THRESHOLD ? " · heavy" : ""}
                          </Badge>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={stepForward}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDate(new Date());
                setCameFromMonth(calendarView === "month");
                setCalendarView("day");
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={zoomIn}
              disabled={calendarView === "day"}
              title="Zoom in (month → week → day)"
            >
              <ChevronsRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Day's visits — shown in day & week views */}
          {calendarView !== "month" && (
          <div className="space-y-2">
            {dayOrders.length > 0 ? dayOrders.map(o => (
              <VisitRow
                key={o.id}
                visit={o}
                showTeamColor={teamFilter === "ALL"}
                showCustomerName
                onChanged={load}
              />
            )) : (
              <p className="text-muted-foreground text-center py-4 text-sm">No visits for this day</p>
            )}
          </div>
          )}

          {/* Week grid */}
          {calendarView === "week" && (
          <div>
            <div className="grid grid-cols-7 gap-1 min-h-[200px]">
                {weekDays.map(day => {
                  const dayVisits = getOrdersForDate(day);
                  const today = isToday(day);
                  const selected = isSameDay(day, selectedDate);
                  const workday = isWorkday(day);
                  const nonWorkLabel = getNonWorkdayLabel(day);
                  const overload = isDayOverloaded(day);
                  return (
                    <div
                      key={day.toISOString()}
                      title={overload.overloaded ? overload.label : undefined}
                      className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                        overload.overloaded
                          ? "border-l-4 border-l-orange-500 border-orange-500/40 bg-orange-500/10"
                          : selected ? "border-primary bg-primary/5" : today ? "border-primary/40 bg-primary/[0.02]" : !workday ? "border-border bg-muted/40" : "border-border"
                      }`}
                      onClick={() => setSelectedDate(day)}
                    >
                      <div className="text-center mb-2">
                        <p className="text-xs text-muted-foreground">{format(day, "EEE")}</p>
                        <p className={`text-sm font-semibold ${overload.overloaded ? "text-orange-600" : today ? "text-primary" : !workday ? "text-muted-foreground" : ""}`}>
                          {format(day, "d")}{overload.overloaded ? " •" : ""}
                        </p>
                        {nonWorkLabel && <p className="text-[9px] text-destructive/70 truncate">{nonWorkLabel}</p>}
                      </div>
                    <div className="space-y-1">
                      {dayVisits.slice(0, 3).map(o => {
                        const tc = o.team_id ? teamColorMap[o.team_id] : undefined;
                        return (
                          <Link key={o.id} to={`/provider/visits/${o.id}`} onClick={e => e.stopPropagation()}>
                            <div
                              className={`rounded px-1.5 py-1 text-[10px] leading-tight truncate ${statusColor(o.status)}`}
                              style={teamFilter === "ALL" && tc ? { borderLeft: `3px solid ${tc}` } : {}}
                            >
                              {(o.properties as any)?.name}
                            </div>
                          </Link>
                        );
                      })}
                      {dayVisits.length > 3 && (
                        <p className="text-[10px] text-muted-foreground text-center">+{dayVisits.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Month grid */}
          {calendarView === "month" && (
            <div>
              <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                  <div key={d} className="text-center py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map(day => {
                  const dayVisits = getOrdersForDate(day);
                  const today = isToday(day);
                  const inMonth = isSameMonth(day, selectedDate);
                  const workday = isWorkday(day);
                  const nonWorkLabel = getNonWorkdayLabel(day);
                  const overload = isDayOverloaded(day);
                  return (
                    <div
                      key={day.toISOString()}
                      title={overload.overloaded ? overload.label : undefined}
                      className={`min-h-[88px] rounded-md border p-1.5 cursor-pointer transition-colors ${
                        overload.overloaded
                          ? "border-l-4 border-l-orange-500 border-orange-500/40 bg-orange-500/10"
                          : today ? "border-primary/40 bg-primary/[0.04]" : !workday ? "border-border bg-muted/40" : "border-border"
                      } ${!inMonth ? "opacity-40" : ""}`}
                      onClick={() => { setSelectedDate(day); setCameFromMonth(true); setCalendarView("day"); }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold ${overload.overloaded ? "text-orange-600" : today ? "text-primary" : !workday ? "text-muted-foreground" : ""}`}>
                          {format(day, "d")}{overload.overloaded ? " •" : ""}
                        </span>
                        {nonWorkLabel && <span className="text-[8px] text-destructive/70 truncate ml-1">{nonWorkLabel}</span>}
                      </div>
                      <div className="space-y-0.5">
                        {dayVisits.slice(0, 2).map(o => {
                          const tc = o.team_id ? teamColorMap[o.team_id] : undefined;
                          return (
                            <Link key={o.id} to={`/provider/visits/${o.id}`} onClick={e => e.stopPropagation()}>
                              <div
                                className={`rounded px-1 py-0.5 text-[9px] leading-tight truncate ${statusColor(o.status)}`}
                                style={teamFilter === "ALL" && tc ? { borderLeft: `2px solid ${tc}` } : {}}
                              >
                                {(o.properties as any)?.name}
                              </div>
                            </Link>
                          );
                        })}
                        {dayVisits.length > 2 && (
                          <p className="text-[9px] text-muted-foreground text-center">+{dayVisits.length - 2}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* List view */}
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
                <SelectItem value="NEEDS_REVIEW">Needs Client Review</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filtered.map(o => (
              <VisitRow
                key={o.id}
                visit={o}
                showTeamColor={teamFilter === "ALL"}
                showCustomerName
                onChanged={load}
              />
            ))}
            {filtered.length === 0 && <p className="text-muted-foreground text-center py-8">No service visits found</p>}
          </div>
        </>
      )}

      <CreateAdHocVisitDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}
