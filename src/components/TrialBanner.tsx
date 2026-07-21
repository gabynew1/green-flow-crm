import { Link } from "react-router-dom";
import { Sparkles, AlertTriangle } from "lucide-react";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { cn } from "@/lib/utils";

function daysBetween(target: string | null): number {
  if (!target) return 0;
  const ms = new Date(target).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function TrialBanner() {
  const { data: tenant } = useTenantSubscription();
  if (!tenant) return null;
  const status = tenant.subscription_status;

  if (status === "trial_active") {
    const days = daysBetween(tenant.trial_expires_at);
    const urgent = days <= 7;
    return (
      <div className={cn(
        "w-full px-4 py-2 text-sm flex items-center justify-center gap-3 border-b",
        urgent ? "bg-amber-50 text-amber-900 border-amber-200"
               : "bg-emerald-50 text-emerald-900 border-emerald-200"
      )}>
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          Your full-access trial ends in {days} day{days === 1 ? "" : "s"}.
        </span>
        <Link to="/pricing" className="rounded-full bg-white/70 px-3 py-0.5 text-xs font-semibold hover:bg-white">
          Upgrade Now
        </Link>
      </div>
    );
  }

  if (status === "grace") {
    const days = daysBetween(tenant.grace_ends_at);
    return (
      <div className="w-full px-4 py-2 text-sm flex items-center justify-center gap-3 border-b bg-red-50 text-red-900 border-red-200">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          Trial ended — {days} day{days === 1 ? "" : "s"} left in grace. Workspace is running with Patio permissions.
        </span>
        <Link to="/pricing" className="rounded-full bg-white/70 px-3 py-0.5 text-xs font-semibold hover:bg-white">
          Upgrade
        </Link>
      </div>
    );
  }

  return null;
}