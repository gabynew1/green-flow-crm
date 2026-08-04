import { supabase } from "@/integrations/supabase/client";

export type EmailOpsAction = {
  code: string;
  label: string;
  variant?: "default" | "outline" | "destructive";
  confirm?: string;
};

export type EmailAlert = {
  severity: "critical" | "warning";
  code: string;
  title: string;
  message: string;
  detail?: string | null;
  count?: number;
  actions?: EmailOpsAction[];
};

export async function invokeEmailOps(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-email-ops", { body });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

/** Runs a server-side action for an alert button. Returns a human message. */
export async function runAlertAction(code: string): Promise<string> {
  switch (code) {
    case "retry_all_dlq": {
      const r = await invokeEmailOps({ action: "replay_dlq_bulk" });
      return `${r.processed ?? 0} message(s) queued for another attempt.`;
    }
    case "discard_all_dlq": {
      const r = await invokeEmailOps({ action: "discard_dlq_bulk" });
      return `${r.processed ?? 0} message(s) permanently discarded.`;
    }
    case "clear_rate_limit":
      await invokeEmailOps({ action: "clear_rate_limit" });
      return "Sending resumed.";
    case "run_dispatcher":
      await invokeEmailOps({ action: "run_dispatcher" });
      return "Dispatcher run triggered.";
    case "verify_resend": {
      const r = await invokeEmailOps({ action: "verify_resend" });
      return r.status === "ok"
        ? "Resend connector responded normally."
        : `Resend check: ${r.status} — ${r.message ?? ""}`;
    }
    default:
      return "Done.";
  }
}
