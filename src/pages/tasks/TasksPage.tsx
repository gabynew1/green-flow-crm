import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActionTasks, actOnTask, ActionTaskRow } from "@/hooks/useActionTasks";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Check, X, Search, ArrowDownLeft, ArrowUpRight, ListChecks, CalendarDays } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApproveLinkDialog } from "@/components/client/ApproveLinkDialog";
import ScheduleView from "./ScheduleView";

const TYPE_LABEL: Record<string, string> = {
  link_request: "Property link request",
  offer_response: "Offer response",
  contract_response: "Contract response",
  inspection_confirmation: "Inspection confirmation",
  contract_renewal: "Contract renewal",
};

const STATUS_VARIANT: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  expired: "bg-muted text-muted-foreground border-border",
};

// UI category → underlying task statuses
const CATEGORY_STATUSES: Record<string, string[]> = {
  all: [],
  pending: ["pending"],
  accepted: ["approved"],
  rejected: ["rejected"],
  done: ["approved", "rejected", "cancelled", "expired"],
};

type Enrichment = {
  profiles: Record<string, { name: string; email?: string | null }>;
  tenants: Record<string, { name: string }>;
  properties: Record<string, { name: string; address?: string | null }>;
  offers: Record<string, { name: string }>;
  contracts: Record<string, { name: string }>;
  inspections: Record<string, { name: string }>;
};

const emptyEnrichment: Enrichment = {
  profiles: {}, tenants: {}, properties: {}, offers: {}, contracts: {}, inspections: {},
};

function collectIds(tasks: ActionTaskRow[]) {
  const userIds = new Set<string>();
  const tenantIds = new Set<string>();
  const propertyIds = new Set<string>();
  const offerIds = new Set<string>();
  const contractIds = new Set<string>();
  const inspectionIds = new Set<string>();
  for (const t of tasks) {
    if (t.initiator_user_id) userIds.add(t.initiator_user_id);
    if (t.target_user_id) userIds.add(t.target_user_id);
    if (t.tenant_id) tenantIds.add(t.tenant_id);
    const p = t.payload || {};
    const pushFromPayload = (val: any, set: Set<string>) => {
      if (typeof val === "string" && /^[0-9a-f-]{36}$/i.test(val)) set.add(val);
      if (Array.isArray(val)) val.forEach((v) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) && set.add(v));
    };
    pushFromPayload(p.property_id, propertyIds);
    pushFromPayload(p.property_ids, propertyIds);
    pushFromPayload(p.offer_id, offerIds);
    pushFromPayload(p.contract_id, contractIds);
    pushFromPayload(p.inspection_id, inspectionIds);
    if (t.subject_entity_type === "property" && t.subject_entity_id) propertyIds.add(t.subject_entity_id);
    if (t.subject_entity_type === "offer" && t.subject_entity_id) offerIds.add(t.subject_entity_id);
    if (t.subject_entity_type === "contract" && t.subject_entity_id) contractIds.add(t.subject_entity_id);
    if (t.subject_entity_type === "inspection" && t.subject_entity_id) inspectionIds.add(t.subject_entity_id);
  }
  return { userIds, tenantIds, propertyIds, offerIds, contractIds, inspectionIds };
}

function useTaskEnrichment(tasks: ActionTaskRow[]): Enrichment {
  const [data, setData] = useState<Enrichment>(emptyEnrichment);
  const key = useMemo(() => tasks.map((t) => t.id).join(","), [tasks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tasks.length === 0) {
        setData(emptyEnrichment);
        return;
      }
      const { userIds, tenantIds, propertyIds, offerIds, contractIds, inspectionIds } = collectIds(tasks);
      const arr = (s: Set<string>) => Array.from(s);
      const [profilesRes, tenantsRes, propsRes, offersRes, contractsRes, inspRes] = await Promise.all([
        userIds.size
          ? supabase.from("profiles").select("user_id, full_name, email, contact_email, company_name").in("user_id", arr(userIds))
          : Promise.resolve({ data: [] as any[] }),
        tenantIds.size
          ? supabase.from("tenants").select("id, name").in("id", arr(tenantIds))
          : Promise.resolve({ data: [] as any[] }),
        propertyIds.size
          ? supabase.from("properties").select("id, name, address").in("id", arr(propertyIds))
          : Promise.resolve({ data: [] as any[] }),
        offerIds.size
          ? supabase.from("offers").select("id, offer_name").in("id", arr(offerIds))
          : Promise.resolve({ data: [] as any[] }),
        contractIds.size
          ? supabase.from("contracts").select("id, contract_name").in("id", arr(contractIds))
          : Promise.resolve({ data: [] as any[] }),
        inspectionIds.size
          ? supabase.from("inspections").select("id, title").in("id", arr(inspectionIds))
          : Promise.resolve({ data: [] as any[] }),
      ]);
      if (cancelled) return;
      const profiles: Enrichment["profiles"] = {};
      (profilesRes.data ?? []).forEach((p: any) => {
        profiles[p.user_id] = {
          name: p.full_name || p.company_name || p.email || "Unknown",
          email: p.contact_email || p.email,
        };
      });
      const tenants: Enrichment["tenants"] = {};
      (tenantsRes.data ?? []).forEach((t: any) => { tenants[t.id] = { name: t.name }; });
      const properties: Enrichment["properties"] = {};
      (propsRes.data ?? []).forEach((p: any) => { properties[p.id] = { name: p.name, address: p.address }; });
      const offers: Enrichment["offers"] = {};
      (offersRes.data ?? []).forEach((o: any) => { offers[o.id] = { name: o.offer_name }; });
      const contracts: Enrichment["contracts"] = {};
      (contractsRes.data ?? []).forEach((c: any) => { contracts[c.id] = { name: c.contract_name }; });
      const inspections: Enrichment["inspections"] = {};
      (inspRes.data ?? []).forEach((i: any) => { inspections[i.id] = { name: i.title }; });
      setData({ profiles, tenants, properties, offers, contracts, inspections });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

function describeSubject(t: ActionTaskRow, e: Enrichment): string {
  const p = t.payload || {};
  const propIds: string[] = Array.isArray(p.property_ids)
    ? p.property_ids
    : p.property_id
    ? [p.property_id]
    : t.subject_entity_type === "property" && t.subject_entity_id
    ? [t.subject_entity_id]
    : [];
  const propNames = propIds.map((id) => e.properties[id]?.name).filter(Boolean) as string[];

  if (t.task_type === "link_request") {
    if (propNames.length) return `Properties: ${propNames.join(", ")}`;
    return p.provider_name ? `From ${p.provider_name}` : "Connection request";
  }
  if (t.task_type === "offer_response") {
    const off = p.offer_id ? e.offers[p.offer_id]?.name : t.subject_entity_id ? e.offers[t.subject_entity_id]?.name : null;
    return off ? `Offer: ${off}` : "Offer";
  }
  if (t.task_type === "contract_response" || t.task_type === "contract_renewal") {
    const c = p.contract_id ? e.contracts[p.contract_id]?.name : t.subject_entity_id ? e.contracts[t.subject_entity_id]?.name : null;
    return c ? `Contract: ${c}` : "Contract";
  }
  if (t.task_type === "inspection_confirmation") {
    const i = p.inspection_id ? e.inspections[p.inspection_id]?.name : t.subject_entity_id ? e.inspections[t.subject_entity_id]?.name : null;
    return i ? `Inspection: ${i}` : "Inspection";
  }
  return propNames[0] ?? "—";
}

function describeCounterparty(
  t: ActionTaskRow & { _direction: "incoming" | "outgoing" },
  e: Enrichment,
  currentUserId?: string
): string {
  // For incoming tasks → who sent it. For outgoing → who it's for.
  const otherUserId = t._direction === "incoming" ? t.initiator_user_id : t.target_user_id;
  const profileName = otherUserId ? e.profiles[otherUserId]?.name : null;
  if (profileName) return profileName;
  // fallback to tenant or payload provider name
  if ((t.payload as any)?.provider_name) return (t.payload as any).provider_name;
  if ((t.payload as any)?.client_name) return (t.payload as any).client_name;
  if (t.tenant_id && e.tenants[t.tenant_id]) return e.tenants[t.tenant_id].name;
  return t._direction === "incoming" ? "Unassigned" : "Tenant team";
}

export default function TasksPage() {
  const { user, isClient, isProvider } = useAuth();
  const { pendingForMe, mineInitiated, loading, reload } = useActionTasks();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedId = searchParams.get("task");
  const [selected, setSelected] = useState<ActionTaskRow | null>(null);
  const [actionDialog, setActionDialog] = useState<null | "approve" | "reject">(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [linkApproveTaskId, setLinkApproveTaskId] = useState<string | null>(null);
  const [linkApproveTenant, setLinkApproveTenant] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"tasks" | "schedule">("tasks");

  // Combine incoming + outgoing tasks with a direction marker
  const allTasks = useMemo(() => {
    const incoming = pendingForMe.map((t) => ({ ...t, _direction: "incoming" as const }));
    const outgoing = mineInitiated.map((t) => ({ ...t, _direction: "outgoing" as const }));
    // De-duplicate (task may appear in both lists)
    const map = new Map<string, ActionTaskRow & { _direction: "incoming" | "outgoing" }>();
    [...incoming, ...outgoing].forEach((t) => {
      if (!map.has(t.id)) map.set(t.id, t);
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [pendingForMe, mineInitiated]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTasks.length, pending: 0, accepted: 0, rejected: 0, done: 0 };
    allTasks.forEach((t) => {
      if (t.status === "pending") c.pending += 1;
      if (t.status === "approved") { c.accepted += 1; c.done += 1; }
      if (t.status === "rejected") { c.rejected += 1; c.done += 1; }
      if (t.status === "cancelled" || t.status === "expired") c.done += 1;
    });
    return c;
  }, [allTasks]);

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      const statuses = CATEGORY_STATUSES[category];
      if (statuses.length > 0 && !statuses.includes(t.status)) return false;
      if (typeFilter !== "all" && t.task_type !== typeFilter) return false;
      if (search.trim()) {
        const hay = `${TYPE_LABEL[t.task_type] ?? t.task_type} ${JSON.stringify(t.payload ?? {})}`.toLowerCase();
        if (!hay.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [allTasks, category, typeFilter, search]);

  // Auto-select task from URL
  useEffect(() => {
    if (!focusedId) return;
    const all = [...pendingForMe, ...mineInitiated];
    const t = all.find((x) => x.id === focusedId);
    if (t) setSelected(t);
  }, [focusedId, pendingForMe, mineInitiated]);

  // Load detail (events + comments) when a task is selected
  useEffect(() => {
    if (!selected) {
      setEvents([]);
      setComments([]);
      return;
    }
    (async () => {
      const [{ data: ev }, { data: cm }] = await Promise.all([
        supabase.from("action_task_events").select("*").eq("task_id", selected.id).order("created_at"),
        supabase.from("action_task_comments").select("*").eq("task_id", selected.id).order("created_at"),
      ]);
      setEvents(ev ?? []);
      setComments(cm ?? []);
    })();
  }, [selected]);

  const submitAction = async () => {
    if (!selected || !actionDialog) return;
    if (actionDialog === "reject" && !comment.trim()) {
      toast.error("A comment is required when rejecting");
      return;
    }
    setSubmitting(true);
    try {
      await actOnTask(selected.id, actionDialog, comment.trim() || undefined);
      toast.success(actionDialog === "approve" ? "Task approved" : "Task rejected");
      setActionDialog(null);
      setComment("");
      setSelected(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const isMyTask = (t: ActionTaskRow) =>
    t.target_user_id === user?.id || t.target_user_id === null;

  const openTask = (t: ActionTaskRow) => {
    setSelected(t);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("task", t.id);
      return next;
    });
  };

  const taskTypes = useMemo(
    () => Array.from(new Set(allTasks.map((t) => t.task_type))),
    [allTasks]
  );

  const enrichment = useTaskEnrichment(allTasks);

  // Re-filter using enriched search hits
  const enrichedFiltered = useMemo(() => {
    return filteredTasks.filter((t) => {
      if (!search.trim()) return true;
      const subj = describeSubject(t, enrichment);
      const who = describeCounterparty(t, enrichment, user?.id);
      const hay = `${TYPE_LABEL[t.task_type] ?? t.task_type} ${subj} ${who}`.toLowerCase();
      return hay.includes(search.trim().toLowerCase());
    });
  }, [filteredTasks, enrichment, search, user?.id]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Tasks &amp; Notifications</h1>
          <p className="text-sm text-muted-foreground">All requests in one place</p>
        </div>

        {/* View switcher */}
        <div className="flex w-fit gap-1 rounded-lg bg-muted p-1">
          <Button
            size="sm"
            variant={view === "tasks" ? "default" : "ghost"}
            onClick={() => setView("tasks")}
            className="gap-1.5"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Tasks
          </Button>
          <Button
            size="sm"
            variant={view === "schedule" ? "default" : "ghost"}
            onClick={() => setView("schedule")}
            className="gap-1.5"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Schedule
          </Button>
        </div>

        {view === "schedule" ? (
          <ScheduleView
            pendingTasks={pendingForMe}
            onSelectTask={(t) => openTask(t)}
          />
        ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            {/* Category pills */}
            <div className="flex flex-wrap gap-2">
              {(["all", "pending", "accepted", "rejected", "done"] as const).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={category === c ? "default" : "outline"}
                  onClick={() => setCategory(c)}
                  className="capitalize"
                >
                  {c} <span className="ml-1 opacity-70">({counts[c] ?? 0})</span>
                </Button>
              ))}
            </div>

            {/* Search + type filter */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="sm:w-56">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {taskTypes.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      {TYPE_LABEL[tp] ?? tp}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Inline table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Who</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-16" />
                      </TableCell>
                    </TableRow>
                  ) : enrichedFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                        No tasks match these filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    enrichedFiltered.map((t) => (
                      <TableRow
                        key={t.id}
                        onClick={() => openTask(t)}
                        className={cn(
                          "cursor-pointer",
                          selected?.id === t.id && "bg-primary/5"
                        )}
                      >
                        <TableCell className="text-muted-foreground">
                          {t._direction === "incoming" ? (
                            <ArrowDownLeft className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {TYPE_LABEL[t.task_type] ?? t.task_type}
                        </TableCell>
                        <TableCell className="text-sm">
                          {describeCounterparty(t, enrichment, user?.id)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {describeSubject(t, enrichment)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] uppercase", STATUS_VARIANT[t.status])}
                          >
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.due_at ? format(new Date(t.due_at), "PP") : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      {/* Detail panel */}
      <div>
        {selected ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-lg">{TYPE_LABEL[selected.task_type] ?? selected.task_type}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}
                    {selected.due_at && ` · due ${format(new Date(selected.due_at), "PPP")}`}
                  </p>
                </div>
                <Badge variant="outline" className={cn("text-[10px] uppercase", STATUS_VARIANT[selected.status])}>
                  {selected.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Friendly summary */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Details</p>
                <dl className="space-y-1.5 text-sm">
                  {(() => {
                    const initiator = enrichment.profiles[selected.initiator_user_id];
                    const target = selected.target_user_id ? enrichment.profiles[selected.target_user_id] : null;
                    const tenant = selected.tenant_id ? enrichment.tenants[selected.tenant_id] : null;
                    const propIds: string[] = Array.isArray(selected.payload?.property_ids)
                      ? selected.payload.property_ids
                      : selected.payload?.property_id
                      ? [selected.payload.property_id]
                      : selected.subject_entity_type === "property" && selected.subject_entity_id
                      ? [selected.subject_entity_id]
                      : [];
                    const props = propIds
                      .map((id) => enrichment.properties[id])
                      .filter(Boolean) as { name: string; address?: string | null }[];
                    return (
                      <>
                        {initiator && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">From</dt>
                            <dd className="text-right font-medium">
                              {initiator.name}
                              {initiator.email && (
                                <span className="block text-xs text-muted-foreground">{initiator.email}</span>
                              )}
                            </dd>
                          </div>
                        )}
                        {target && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">To</dt>
                            <dd className="text-right font-medium">{target.name}</dd>
                          </div>
                        )}
                        {tenant && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Workspace</dt>
                            <dd className="text-right font-medium">{tenant.name}</dd>
                          </div>
                        )}
                        {props.length > 0 && (
                          <div className="border-t border-border/60 pt-2">
                            <dt className="text-muted-foreground mb-1">Properties</dt>
                            <dd className="space-y-1">
                              {props.map((p, i) => (
                                <div key={i} className="text-sm">
                                  <p className="font-medium">{p.name}</p>
                                  {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                                </div>
                              ))}
                            </dd>
                          </div>
                        )}
                        {selected.payload?.offer_id && enrichment.offers[selected.payload.offer_id] && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Offer</dt>
                            <dd className="text-right font-medium">{enrichment.offers[selected.payload.offer_id].name}</dd>
                          </div>
                        )}
                        {selected.payload?.contract_id && enrichment.contracts[selected.payload.contract_id] && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Contract</dt>
                            <dd className="text-right font-medium">{enrichment.contracts[selected.payload.contract_id].name}</dd>
                          </div>
                        )}
                        {selected.payload?.inspection_id && enrichment.inspections[selected.payload.inspection_id] && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-muted-foreground">Inspection</dt>
                            <dd className="text-right font-medium">{enrichment.inspections[selected.payload.inspection_id].name}</dd>
                          </div>
                        )}
                        {selected.payload?.note && (
                          <div className="border-t border-border/60 pt-2">
                            <dt className="text-muted-foreground mb-1">Note</dt>
                            <dd className="text-sm">{selected.payload.note}</dd>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </dl>
              </div>

              {/* Actions */}
              {selected.status === "pending" && isMyTask(selected) && (
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      // For client-side property link requests, open the property selector dialog
                      if (selected.task_type === "link_request" && isClient && !isProvider) {
                        setLinkApproveTaskId(selected.id);
                        setLinkApproveTenant(
                          selected.payload?.provider_name ?? null
                        );
                      } else {
                        setActionDialog("approve");
                      }
                    }}
                    className="flex-1"
                  >
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button variant="destructive" onClick={() => setActionDialog("reject")} className="flex-1">
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              )}
              {selected.status === "pending" && selected.initiator_user_id === user?.id && (
                <Button variant="outline" className="w-full" onClick={async () => {
                  await actOnTask(selected.id, "cancel");
                  toast.success("Request cancelled");
                  setSelected(null);
                  reload();
                }}>
                  Cancel request
                </Button>
              )}

              {/* Comments */}
              {comments.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Comments</p>
                  <ul className="space-y-2">
                    {comments.map((c) => (
                      <li key={c.id} className="rounded-lg border bg-card p-2 text-sm">
                        <p>{c.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Audit timeline */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Audit trail</p>
                <ol className="space-y-1 border-l border-border pl-4 text-sm">
                  {events.map((e) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[18px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                      <span className="font-medium capitalize">{e.event_type.replace(/_/g, " ")}</span>{" "}
                      <span className="text-xs text-muted-foreground">
                        · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card><CardContent className="py-20 text-center text-sm text-muted-foreground">
            Select a task to view details
          </CardContent></Card>
        )}
      </div>

      {/* Action dialog */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => !o && setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog === "approve" ? "Approve task" : "Reject task"}</DialogTitle>
            <DialogDescription>
              {actionDialog === "approve"
                ? "Add an optional comment for the requester."
                : "Please explain why you're rejecting this request."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={actionDialog === "reject" ? "Reason for rejection (required)" : "Optional comment"}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button
              onClick={submitAction}
              disabled={submitting || (actionDialog === "reject" && !comment.trim())}
              variant={actionDialog === "reject" ? "destructive" : "default"}
            >
              {submitting ? "Submitting…" : actionDialog === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApproveLinkDialog
        taskId={linkApproveTaskId}
        tenantName={linkApproveTenant}
        onClose={() => {
          setLinkApproveTaskId(null);
          setLinkApproveTenant(null);
        }}
        onDone={() => {
          setSelected(null);
          reload();
        }}
      />
    </div>
  );
}