import { Link } from "react-router-dom";
import { Leaf, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/PricingTable";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { isTrial } from "@/lib/tiers";

export default function Pricing() {
  const { data: tenant } = useTenantSubscription();
  const onTrial = isTrial(tenant?.subscription_tier);

  return (
    <div className="min-h-screen bg-[hsl(40_30%_96%)] text-stone-900">
      <header className="border-b border-stone-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-emerald-800">
            <Leaf className="h-5 w-5" />
            <span>GreenGrass CRM</span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            Pricing
          </p>
          <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-stone-900">
            Grow at your own pace.
          </h1>
          <p className="mt-4 text-stone-600 text-lg">
            From a single patio to an entire territory — pick the plan that fits today,
            and upgrade when you're ready. All paid plans + VAT.
          </p>
          {onTrial && (
            <p className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
              You're on the 90-day Territory trial — every feature unlocked.
            </p>
          )}
        </div>

        <div className="mt-12">
          <PricingTable currentTier={tenant?.subscription_tier} isOnTrial={onTrial} />
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3 text-sm text-stone-700">
          <div>
            <h3 className="font-bold text-stone-900">90-day full trial</h3>
            <p className="mt-1 text-stone-600">
              Every new account starts on Territory for 90 days. No credit card required.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-stone-900">No data loss on downgrade</h3>
            <p className="mt-1 text-stone-600">
              Your data stays. Excess teams are simply locked until you upgrade again.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-stone-900">VAT-compliant invoicing</h3>
            <p className="mt-1 text-stone-600">
              Add your VAT ID in Settings to receive proper EU VAT invoices.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}