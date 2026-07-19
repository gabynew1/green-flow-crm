import { useState } from "react";
import { format } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { VisitRow, VisitRowKind } from "./VisitRow";

type Visit = any;

function VisitSection({
  title,
  items,
  kind,
  defaultOpen,
  onChanged,
  todayIso,
  showCustomerName,
}: {
  title: string;
  items: Visit[];
  kind: VisitRowKind;
  defaultOpen: boolean;
  onChanged: () => void;
  todayIso?: string;
  showCustomerName?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span>{title} · {items.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        {items.map((o, i) => {
          const showTodayDivider =
            kind === "upcoming" && todayIso && o.scheduled_date === todayIso &&
            (i === 0 || items[i - 1].scheduled_date !== todayIso);
          return (
            <div key={o.id} className="space-y-2">
              {showTodayDivider && (
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <div className="flex-1 h-px bg-border" />
                  <span>Today</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <VisitRow visit={o} kind={kind} onChanged={onChanged} showCustomerName={showCustomerName} />
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function VisitSections({
  visits,
  onChanged,
  showCustomerName,
}: {
  visits: Visit[];
  onChanged: () => void;
  showCustomerName?: boolean;
}) {
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const overdue: Visit[] = [];
  const upcoming: Visit[] = [];
  const past: Visit[] = [];
  for (const v of visits) {
    const active = v.status !== "COMPLETED" && v.status !== "CANCELED";
    if (!active) past.push(v);
    else if (v.scheduled_date && v.scheduled_date < todayIso) overdue.push(v);
    else upcoming.push(v);
  }
  overdue.sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
  upcoming.sort((a, b) => (a.scheduled_date || "").localeCompare(b.scheduled_date || ""));
  past.sort((a, b) => (b.scheduled_date || "").localeCompare(a.scheduled_date || ""));

  return (
    <div className="space-y-5">
      <VisitSection title="Overdue" items={overdue} kind="overdue" defaultOpen onChanged={onChanged} showCustomerName={showCustomerName} />
      {upcoming.length === 0 && (overdue.length > 0 || past.length > 0) && (
        <p className="text-xs text-muted-foreground">No upcoming visits.</p>
      )}
      <VisitSection title="Upcoming" items={upcoming} kind="upcoming" defaultOpen onChanged={onChanged} todayIso={todayIso} showCustomerName={showCustomerName} />
      <VisitSection title="Past" items={past} kind="past" defaultOpen={false} onChanged={onChanged} showCustomerName={showCustomerName} />
    </div>
  );
}

export default VisitSections;