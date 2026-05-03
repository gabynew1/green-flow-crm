import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, AlertOctagon, Loader2, ShieldCheck } from "lucide-react";

type Alert = {
  severity: "critical" | "warning";
  code: string;
  title: string;
  message: string;
  detail?: string | null;
  count?: number;
};

interface Props {
  /** When true, render a green "all clear" card if there are no alerts. */
  showOkState?: boolean;
}

export default function EmailAlertsBanner({ showOkState = false }: Props) {
  const q = useQuery({
    queryKey: ["email-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_email_alerts");
      if (error) throw error;
      return data as { alerts: Alert[]; generated_at: string };
    },
    refetchInterval: 15_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin mr-2" /> Checking email alerts…
      </div>
    );
  }

  const alerts = q.data?.alerts ?? [];

  if (alerts.length === 0) {
    if (!showOkState) return null;
    return (
      <Alert className="border-emerald-500/30 bg-emerald-500/5">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <AlertTitle className="text-emerald-700">All systems normal</AlertTitle>
        <AlertDescription className="text-emerald-700/80">
          No Resend or queue issues detected.
        </AlertDescription>
      </Alert>
    );
  }

  // Sort: critical first
  const sorted = [...alerts].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1
  );

  return (
    <div className="space-y-2">
      {sorted.map((a) => {
        const isCritical = a.severity === "critical";
        const Icon = isCritical ? AlertOctagon : AlertTriangle;
        return (
          <Alert
            key={a.code}
            variant={isCritical ? "destructive" : "default"}
            className={
              isCritical
                ? ""
                : "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200"
            }
          >
            <Icon className={`h-4 w-4 ${isCritical ? "" : "text-amber-600"}`} />
            <AlertTitle>{a.title}</AlertTitle>
            <AlertDescription className="space-y-1">
              <p>{a.message}</p>
              {a.detail && (
                <p className="font-mono text-xs opacity-80 break-all">{a.detail}</p>
              )}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}