import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, Check, X } from "lucide-react";
import { ApproveLinkDialog } from "@/components/client/ApproveLinkDialog";
import { actOnTask } from "@/hooks/useActionTasks";
import { toast } from "sonner";

interface PendingLink {
  id: string;
  tenant_id: string;
  created_at: string;
  payload: any;
  tenants?: { name: string | null } | null;
}

export function ConnectionRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<PendingLink[]>([]);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [approving, setApproving] = useState<{ id: string; tenantName: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("action_tasks")
      .select("id, tenant_id, created_at, payload, tenants(name)")
      .eq("task_type", "link_request")
      .eq("status", "pending")
      .eq("target_user_id", user.id);
    setRequests((data as any[]) ?? []);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const deny = async (id: string) => {
    setDenyingId(id);
    try {
      await actOnTask(id, "reject", "Connection request denied");
      toast.success("Request denied");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to deny");
    } finally {
      setDenyingId(null);
    }
  };

  if (requests.length === 0) {
    return (
      <ApproveLinkDialog
        taskId={approving?.id ?? null}
        tenantName={approving?.tenantName}
        onClose={() => setApproving(null)}
        onDone={load}
      />
    );
  }

  return (
    <div className="space-y-3 mb-6">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <UserPlus className="h-4 w-4" /> Connection Requests
      </h3>
      {requests.map((r) => {
        const name =
          r.payload?.provider_name ?? r.tenants?.name ?? "A service provider";
        return (
          <Card key={r.id} className="border-primary/30">
            <CardContent className="pt-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{name} wants to connect with you</p>
                <p className="text-xs text-muted-foreground">
                  Requested {new Date(r.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => setApproving({ id: r.id, tenantName: name })}
                >
                  <Check className="h-4 w-4 mr-1" /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => deny(r.id)}
                  disabled={denyingId === r.id}
                >
                  <X className="h-4 w-4 mr-1" /> Deny
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <ApproveLinkDialog
        taskId={approving?.id ?? null}
        tenantName={approving?.tenantName}
        onClose={() => setApproving(null)}
        onDone={load}
      />
    </div>
  );
}
