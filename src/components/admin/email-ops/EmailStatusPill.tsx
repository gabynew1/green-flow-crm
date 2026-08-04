import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, AlertOctagon, RefreshCw } from "lucide-react";
import { invokeEmailOps, type EmailAlert } from "./emailOpsActions";

type Level = "green" | "amber" | "red";

const STYLES: Record<Level, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  green: {
    cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    label: "Resend OK",
    Icon: CheckCircle2,
  },
  amber: {
    cls: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    label: "Degraded",
    Icon: AlertTriangle,
  },
  red: {
    cls: "bg-red-500/10 text-red-700 border-red-500/30",
    label: "Broken",
    Icon: AlertOctagon,
  },
};

export default function EmailStatusPill({ onClick }: { onClick?: () => void }) {
  const alerts = useQuery({
    queryKey: ["email-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_email_alerts");
      if (error) throw error;
      return data as unknown as { alerts: EmailAlert[]; generated_at: string };
    },
    refetchInterval: 15_000,
  });

  const resend = useQuery({
    queryKey: ["resend-verify"],
    queryFn: async () => invokeEmailOps({ action: "verify_resend" }),
    refetchInterval: 60_000,
    retry: false,
  });

  if (alerts.isLoading) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin mr-2" /> Checking email system…
      </span>
    );
  }

  const list = alerts.data?.alerts ?? [];
  const resendStatus: string | undefined = resend.data?.status;

  let level: Level = "green";
  let reason = "Connector responding, queues clear";

  if (list.some((a) => a.severity === "warning")) {
    level = "amber";
    reason = list.find((a) => a.severity === "warning")!.title;
  }
  if (alerts.isError || resendStatus === "auth_failed" || resendStatus === "unreachable") {
    level = "red";
    reason =
      resendStatus === "auth_failed"
        ? "Resend rejected our credentials"
        : resendStatus === "unreachable"
        ? "Resend connector unreachable"
        : "Cannot read email status";
  }
  if (list.some((a) => a.severity === "critical")) {
    level = "red";
    reason = list.find((a) => a.severity === "critical")!.title;
  }

  const { cls, label, Icon } = STYLES[level];
  const checkedAt = alerts.dataUpdatedAt ? new Date(alerts.dataUpdatedAt) : null;

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onClick} className="focus:outline-none">
        <Badge variant="outline" className={`${cls} gap-1.5 px-3 py-1.5 text-sm`}>
          <Icon className="h-4 w-4" />
          <span className="font-semibold">{label}</span>
          <span className="opacity-70 font-normal hidden sm:inline">— {reason}</span>
        </Badge>
      </button>
      <span className="text-[11px] text-muted-foreground hidden md:inline">
        {checkedAt ? `checked ${checkedAt.toLocaleTimeString()}` : ""}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Re-check now"
        onClick={() => {
          alerts.refetch();
          resend.refetch();
        }}
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
