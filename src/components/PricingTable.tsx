import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TIER_ORDER, TIERS, getTierConfig, type TierId } from "@/lib/tiers";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface PricingTableProps {
  currentTier?: string | null;
  isOnTrial?: boolean;
  className?: string;
}

export function PricingTable({ currentTier, isOnTrial, className }: PricingTableProps) {
  const handleChoose = async (tier: TierId) => {
    const cfg = TIERS[tier];
    try {
      await supabase.from("activity_log" as never).insert({} as never).then(() => null).catch(() => null);
    } catch {}
    toast.success(`Thanks! Our team will reach out to upgrade you to ${cfg.name}.`);
  };

  const effectiveCurrent = currentTier === "territory_trial" ? "territory" : currentTier;

  return (
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

            <Button
              className={cn(
                "mt-6 w-full",
                t.highlighted
                  ? "bg-emerald-800 hover:bg-emerald-900 text-white"
                  : "bg-stone-900 hover:bg-stone-800 text-white"
              )}
              onClick={() => handleChoose(id)}
              disabled={isCurrent}
            >
              {isCurrent ? "Current plan" : id === "patio" ? "Get started" : `Choose ${t.name}`}
            </Button>
          </Card>
        );
      })}
    </div>
  );
}