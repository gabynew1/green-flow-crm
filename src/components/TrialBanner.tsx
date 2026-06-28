import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { daysLeftInTrial, isTrial } from "@/lib/tiers";
import { cn } from "@/lib/utils";

export function TrialBanner() {
  const { data: tenant } = useTenantSubscription();
  if (!tenant || !isTrial(tenant.subscription_tier)) return null;

  const days = daysLeftInTrial(tenant.trial_expires_at);
  const urgent = days <= 7;
  const expired = days <= 0;

  return (
    <div
      className={cn(
        "w-full px-4 py-2 text-sm flex items-center justify-center gap-3 border-b",
        expired
          ? "bg-red-50 text-red-900 border-red-200"
          : urgent
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-emerald-50 text-emerald-900 border-emerald-200"
      )}
    >
      <Sparkles className="h-4 w-4 shrink-0" />
      <span className="font-medium">
        {expired
          ? "Trial ended — you're on free Patio. Your data is safe; upgrade to unlock teams + AI."
          : `Your full-access trial ends in ${days} day${days === 1 ? "" : "s"}.`}
      </span>
      <Link
        to="/pricing"
        className="rounded-full bg-white/70 px-3 py-0.5 text-xs font-semibold hover:bg-white"
      >
        {expired ? "View plans" : "Upgrade Now"}
      </Link>
    </div>
  );
}