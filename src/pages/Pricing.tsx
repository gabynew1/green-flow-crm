import { Link } from "react-router-dom";
import { Leaf, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/PricingTable";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { isTrial } from "@/lib/tiers";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function Pricing() {
  const { data: tenant } = useTenantSubscription();
  const onTrial = isTrial(tenant?.subscription_tier);
  const { t } = useTranslation("public");

  return (
    <div className="min-h-screen bg-[hsl(40_30%_96%)] text-stone-900">
      <header className="border-b border-stone-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-emerald-800">
            <Leaf className="h-5 w-5" />
            <span>GreenGrass CRM</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("pricing.back")}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-14">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            {t("pricing.eyebrow")}
          </p>
          <h1 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-stone-900">
            {t("pricing.title")}
          </h1>
          <p className="mt-4 text-stone-600 text-lg">
            {t("pricing.subtitle")}
          </p>
          {onTrial && (
            <p className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
              {t("pricing.trialBadge")}
            </p>
          )}
        </div>

        <div className="mt-12">
          <PricingTable currentTier={tenant?.subscription_tier} isOnTrial={onTrial} />
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3 text-sm text-stone-700">
          <div>
            <h3 className="font-bold text-stone-900">{t("pricing.perks.trial.title")}</h3>
            <p className="mt-1 text-stone-600">{t("pricing.perks.trial.desc")}</p>
          </div>
          <div>
            <h3 className="font-bold text-stone-900">{t("pricing.perks.noDataLoss.title")}</h3>
            <p className="mt-1 text-stone-600">{t("pricing.perks.noDataLoss.desc")}</p>
          </div>
          <div>
            <h3 className="font-bold text-stone-900">{t("pricing.perks.vat.title")}</h3>
            <p className="mt-1 text-stone-600">{t("pricing.perks.vat.desc")}</p>
          </div>
        </div>
      </main>
    </div>
  );
}