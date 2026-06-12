import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { AlertTriangle, RotateCcw, Trash2, Building2, User } from "lucide-react";

type Subject = {
  id: string;
  name: string;
  status: string;
  locked_at: string | null;
  scheduled_delete_at: string | null;
  locked_reason: string | null;
  last_login_at: string | null;
};

const LIFECYCLE_STATES = ["inactivity_warned", "soft_locked", "flagged_for_deletion"];

function statusBadge(status: string) {
  switch (status) {
    case "inactivity_warned":
      return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Inactivity warned</Badge>;
    case "soft_locked":
      return <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-50">Soft-locked</Badge>;
    case "flagged_for_deletion":
      return <Badge variant="destructive">Flagged for deletion</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function LifecycleDashboard() {
  const [processing, setProcessing] = useState<string | null>(null);

  const tenantsQ = useQuery({
    queryKey: ["lifecycle-tenants"],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,status,locked_at,scheduled_delete_at,locked_reason,last_admin_login_at")
        .in("status", LIFECYCLE_STATES)
        .order("scheduled_delete_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((t: any) => ({ ...t, last_login_at: t.last_admin_login_at }));
    },
  });

  const clientsQ = useQuery({
    queryKey: ["lifecycle-clients"],
    queryFn: async (): Promise<Subject[]> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,status,locked_at,scheduled_delete_at,locked_reason,last_client_login_at")
        .in("status", LIFECYCLE_STATES)
        .order("scheduled_delete_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((c: any) => ({ ...c, last_login_at: c.last_client_login_at }));
    },
  });

  const auditQ = useQuery({
    queryKey: ["lifecycle-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lifecycle_deletion_audit")
        .select("*")
        .order("deleted_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reactivate = async (kind: "tenant" | "client", row: Subject) => {
    setProcessing(row.id);
    const fn = kind === "tenant" ? "tenant-reactivate" : "client-reactivate";
    const body = kind === "tenant" ? { tenant_id: row.id } : { customer_id: row.id };
    const { error } = await supabase.functions.invoke(fn, { body });
    if (error) toast.error(error.message);
    else {
      toast.success(`${row.name} reactivated`);
      kind === "tenant" ? tenantsQ.refetch() : clientsQ.refetch();
    }
    setProcessing(null);
  };

  const renderTable = (kind: "tenant" | "client", rows: Subject[] | undefined, loading: boolean) => {
    if (loading) return <div className="h-48 rounded-xl bg-muted animate-pulse border" />;
    if (!rows || rows.length === 0) {
      return (
        <div className="text-center text-muted-foreground py-12 text-sm">
          No {kind === "tenant" ? "tenants" : "client accounts"} in the lifecycle pipeline.
        </div>
      );
    }
    return (
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="font-bold">{kind === "tenant" ? "Organization" : "Client account"}</TableHead>
            <TableHead className="font-bold">Status</TableHead>
            <TableHead className="font-bold">Last login</TableHead>
            <TableHead className="font-bold">Locked</TableHead>
            <TableHead className="font-bold">Scheduled deletion</TableHead>
            <TableHead className="w-[120px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const overdue = r.scheduled_delete_at && new Date(r.scheduled_delete_at).getTime() < Date.now();
            return (
              <TableRow key={r.id} className="group hover:bg-primary/5">
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      {kind === "tenant" ? <Building2 className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-primary" />}
                    </div>
                    <div className="flex flex-col">
                      <span>{r.name}</span>
                      {r.locked_reason && <span className="text-xs text-muted-foreground">{r.locked_reason}</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{statusBadge(r.status)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.last_login_at ? formatDistanceToNow(new Date(r.last_login_at), { addSuffix: true }) : "never"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.locked_at ? format(new Date(r.locked_at), "MMM d, yyyy") : "—"}
                </TableCell>
                <TableCell>
                  {r.scheduled_delete_at ? (
                    <div className="flex items-center gap-2">
                      {overdue && <AlertTriangle className="h-3 w-3 text-destructive" />}
                      <span className={overdue ? "text-destructive font-semibold text-xs" : "text-xs"}>
                        {format(new Date(r.scheduled_delete_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processing === r.id}
                    onClick={() => reactivate(kind, r)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reactivate
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  const tenants = tenantsQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const flagged = [...tenants, ...clients].filter((r) => r.status === "flagged_for_deletion").length;
  const dueWithin7 = [...tenants, ...clients].filter(
    (r) => r.scheduled_delete_at && new Date(r.scheduled_delete_at).getTime() - Date.now() < 7 * 86400000
  ).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Account Lifecycle</h2>
        <p className="text-muted-foreground mt-1 font-medium">
          Inactivity, decommission, and scheduled deletion across tenants and client accounts.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="border-primary/10">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Tenants in pipeline</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{tenants.length}</div></CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Clients in pipeline</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{clients.length}</div></CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Flagged for deletion</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{flagged}</div></CardContent>
        </Card>
        <Card className="border-primary/10">
          <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Deletion ≤ 7 days</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-600">{dueWithin7}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants">Tenants ({tenants.length})</TabsTrigger>
          <TabsTrigger value="clients">Clients ({clients.length})</TabsTrigger>
          <TabsTrigger value="audit">Deletion audit</TabsTrigger>
        </TabsList>
        <TabsContent value="tenants">
          <Card className="border-primary/10 overflow-hidden">
            {renderTable("tenant", tenants, tenantsQ.isLoading)}
          </Card>
        </TabsContent>
        <TabsContent value="clients">
          <Card className="border-primary/10 overflow-hidden">
            {renderTable("client", clients, clientsQ.isLoading)}
          </Card>
        </TabsContent>
        <TabsContent value="audit">
          <Card className="border-primary/10 overflow-hidden">
            {auditQ.isLoading ? (
              <div className="h-48 bg-muted animate-pulse" />
            ) : (auditQ.data ?? []).length === 0 ? (
              <div className="text-center text-muted-foreground py-12 text-sm">No hard deletions recorded yet.</div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="font-bold">Subject</TableHead>
                    <TableHead className="font-bold">Kind</TableHead>
                    <TableHead className="font-bold">Deleted</TableHead>
                    <TableHead className="font-bold">Reason</TableHead>
                    <TableHead className="font-bold">Triggered by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(auditQ.data ?? []).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <Trash2 className="h-3 w-3 text-destructive" /> {a.subject_name}
                      </TableCell>
                      <TableCell><Badge variant="outline">{a.subject_kind}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(a.deleted_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="text-xs">{a.reason}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.triggered_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}