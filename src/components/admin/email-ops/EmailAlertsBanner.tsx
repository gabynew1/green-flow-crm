import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, AlertOctagon, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { runAlertAction, type EmailAlert, type EmailOpsAction } from "./emailOpsActions";

interface Props {
  /** When true, render a green "all clear" card if there are no alerts. */
  showOkState?: boolean;
  /** Navigate to another tab of the Email Operations page. */
  onNavigate?: (tab: "activity" | "dlq" | "health") => void;
}

export default function EmailAlertsBanner({ showOkState = false, onNavigate }: Props) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<EmailOpsAction | null>(null);

  const q = useQuery({
    queryKey: ["email-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_email_alerts");
      if (error) throw error;
      return data as unknown as { alerts: EmailAlert[]; generated_at: string };
    },
    refetchInterval: 15_000,
  });

  async function execute(action: EmailOpsAction) {
    if (action.code === "review_dlq") return onNavigate?.("dlq");
    if (action.code === "view_failures") return onNavigate?.("activity");

    setBusy(action.code);
    try {
      const message = await runAlertAction(action.code);
      toast({ title: action.label, description: message });
      qc.invalidateQueries({ queryKey: ["email-alerts"] });
      qc.invalidateQueries({ queryKey: ["email-health"] });
      qc.invalidateQueries({ queryKey: ["dlq"] });
      qc.invalidateQueries({ queryKey: ["resend-verify"] });
    } catch (e: any) {
      toast({
        title: `${action.label} failed`,
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  function handleClick(action: EmailOpsAction) {
    if (action.confirm) setPending(action);
    else execute(action);
  }

  if (q.isLoading) {
    return (
      <div className="flex items-center text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin mr-2" /> Checking email alerts…
      </div>
    );
  }

  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertOctagon className="h-4 w-4" />
        <AlertTitle>Could not load email alerts</AlertTitle>
        <AlertDescription className="font-mono text-xs break-all">
          {(q.error as any)?.message ?? String(q.error)}
        </AlertDescription>
      </Alert>
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

  const sorted = [...alerts].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1
  );

  return (
    <>
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
              <AlertDescription className="space-y-2">
                <p>{a.message}</p>
                {a.detail && (
                  <p className="font-mono text-xs opacity-80 break-all">{a.detail}</p>
                )}
                {(a.actions ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(a.actions ?? []).map((action) => (
                      <Button
                        key={action.code}
                        size="sm"
                        variant={action.variant ?? "outline"}
                        disabled={busy === action.code}
                        onClick={() => handleClick(action)}
                      >
                        {busy === action.code && (
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        )}
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          );
        })}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.label}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                pending?.variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={() => {
                const action = pending;
                setPending(null);
                if (action) execute(action);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
