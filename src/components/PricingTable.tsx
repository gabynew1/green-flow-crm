import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TIER_ORDER, TIERS, type TierId } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PricingTableProps {
  currentTier?: string | null;
  isOnTrial?: boolean;
  className?: string;
}

export function PricingTable({ currentTier, isOnTrial, className }: PricingTableProps) {
  const { profile, roles, isSuperAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [pendingTier, setPendingTier] = useState<Exclude<TierId, "territory_trial"> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canChange = isSuperAdmin || roles.includes("PROVIDER_ADMIN");
  const tenantId = profile?.tenant_id ?? null;

  const effectiveCurrent = currentTier === "territory_trial" ? "territory" : currentTier;

  const confirmChange = async () => {
    if (!pendingTier || !tenantId) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("fn_change_subscription_tier", {
      p_tenant_id: tenantId,
      p_new_tier: pendingTier,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "Could not change plan");
      return;
    }
    toast.success(`Plan updated to ${TIERS[pendingTier].name}`);
    setPendingTier(null);
    queryClient.invalidateQueries({ queryKey: ["tenant-subscription"] });
    queryClient.invalidateQueries({ queryKey: ["entitlements"] });
  };

  const tierRank = (t?: string | null) =>
    ["patio", "backyard", "estate", "territory"].indexOf(
      t === "territory_trial" ? "territory" : (t ?? "patio")
    );
  const isDowngrade = pendingTier
    ? tierRank(pendingTier) < tierRank(currentTier)
    : false;

  return (
    <TooltipProvider>
    <div className={cn("grid gap-6 md:grid-cols-2 lg:grid-cols-4", className)}>
      {TIER_ORDER.map((id) => {
        const t = TIERS[id];
        const Icon = t.icon;
        const isCurrent = effectiveCurrent === id;
        const showTrialRibbon = isOnTrial && id === "territory";
        return (
          <Card
            key={id}
            className={cn(
              "relative flex flex-col p-6 ring-1 transition-all",
              t.ring,
              t.highlighted && "shadow-xl scale-[1.02] ring-2",
              "bg-[hsl(40_30%_98%)]"
            )}
          >
            {showTrialRibbon && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow">
                Included in your trial
              </div>
            )}
            {t.highlighted && !showTrialRibbon && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-800 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow">
                Most popular
              </div>
            )}

            <div className="flex items-center gap-2">
              <Icon className={cn("h-6 w-6", t.accent)} />
              <h3 className={cn("text-xl font-bold tracking-tight", t.accent)}>{t.name}</h3>
            </div>
            <p className="mt-1 text-sm text-stone-600">{t.tagline}</p>

            <div className="mt-5">
              <div className="flex items-baseline gap-1.5">
                <span className={cn("text-4xl font-extrabold tracking-tight", t.accent)}>{t.priceLabel}</span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-stone-500">{t.vatNote}</p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-stone-700">
                {t.maxTeamsLabel}
              </p>
            </div>

            <ul className="mt-5 space-y-2 flex-1">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-stone-700">
                  <Check className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {(() => {
              const label = isCurrent
                ? "Current plan"
                : id === "patio"
                ? "Switch to Patio (free)"
                : `Choose ${t.name}`;
              const btn = (
                <Button
                  className={cn(
                    "mt-6 w-full",
                    t.highlighted
                      ? "bg-emerald-800 hover:bg-emerald-900 text-white"
                      : "bg-stone-900 hover:bg-stone-800 text-white"
                  )}
                  onClick={() => setPendingTier(id)}
                  disabled={isCurrent || !canChange || !tenantId}
                >
                  {label}
                </Button>
              );
              if (!canChange && !isCurrent) {
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="mt-6 block">{btn}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Ask your provider admin to change the plan.
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return btn;
            })()}
          </Card>
        );
      })}
    </div>

    <AlertDialog open={!!pendingTier} onOpenChange={(o) => !o && !submitting && setPendingTier(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Switch to {pendingTier ? TIERS[pendingTier].name : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-stone-600">
              <p>
                Your plan will change from{" "}
                <strong>
                  {currentTier === "territory_trial"
                    ? "Territory (trial)"
                    : TIERS[(currentTier as Exclude<TierId, "territory_trial">) ?? "patio"]?.name ?? "Patio"}
                </strong>{" "}
                to <strong>{pendingTier ? TIERS[pendingTier].name : ""}</strong> immediately.
              </p>
              {isDowngrade && (
                <p className="text-amber-700">
                  This is a downgrade. Extra teams and seats above the new plan's limits will be soft-locked but your data is preserved.
                </p>
              )}
              {pendingTier && pendingTier !== "patio" && (
                <p>
                  Billing is handled manually by our team for now — no card required. We'll follow up with your VAT invoice.
                </p>
              )}
              {currentTier === "territory_trial" && (
                <p>Your 30-day trial will end when you confirm.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmChange(); }} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </TooltipProvider>
  );
}