import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface ActionTaskRow {
  id: string;
  tenant_id: string;
  task_type: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  initiator_user_id: string;
  initiator_role: string | null;
  target_user_id: string | null;
  target_role: string | null;
  subject_entity_type: string | null;
  subject_entity_id: string | null;
  payload: any;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useActionTasks() {
  const { user, isProvider, tenantId } = useAuth();
  const [pendingForMe, setPendingForMe] = useState<ActionTaskRow[]>([]);
  const [mineInitiated, setMineInitiated] = useState<ActionTaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Pending where I'm target — for providers, also include unassigned tasks in their tenant
    let pendingQuery = supabase
      .from("action_tasks")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (isProvider && tenantId) {
      pendingQuery = pendingQuery.or(`target_user_id.eq.${user.id},and(target_user_id.is.null,tenant_id.eq.${tenantId})`);
    } else {
      pendingQuery = pendingQuery.eq("target_user_id", user.id);
    }
    const [{ data: pending }, { data: mine }] = await Promise.all([
      pendingQuery,
      supabase
        .from("action_tasks")
        .select("*")
        .eq("initiator_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    setPendingForMe((pending as any) ?? []);
    setMineInitiated((mine as any) ?? []);
    setLoading(false);
  }, [user, isProvider, tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime — refetch on any action_tasks change in tenant
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tasks-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "action_tasks" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  return { pendingForMe, mineInitiated, loading, reload: load };
}

export async function actOnTask(
  taskId: string,
  action: "approve" | "reject" | "cancel",
  comment?: string,
  payloadPatch?: Record<string, any>
) {
  const { data, error } = await supabase.rpc("act_on_task" as any, {
    _task_id: taskId,
    _action: action,
    _comment: comment ?? null,
    _payload_patch: payloadPatch ?? {},
  });
  if (error) throw error;
  return data;
}

export async function addTaskComment(taskId: string, body: string) {
  const { data, error } = await supabase.rpc("add_task_comment" as any, { _task_id: taskId, _body: body });
  if (error) throw error;
  return data;
}

export async function createActionTask(args: {
  task_type: string;
  tenant_id: string;
  target_user_id?: string | null;
  target_role?: string | null;
  subject_entity_type?: string | null;
  subject_entity_id?: string | null;
  payload?: any;
  due_at?: string | null;
}) {
  const { data, error } = await supabase.rpc("create_action_task" as any, {
    _task_type: args.task_type,
    _tenant_id: args.tenant_id,
    _target_user_id: args.target_user_id ?? null,
    _target_role: args.target_role ?? null,
    _subject_entity_type: args.subject_entity_type ?? null,
    _subject_entity_id: args.subject_entity_id ?? null,
    _payload: args.payload ?? {},
    _due_at: args.due_at ?? null,
  });
  if (error) throw error;
  return data as string;
}