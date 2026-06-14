import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe } from "lucide-react";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { useLocale } from "@/hooks/useLocale";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function LanguageRegionCard() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          {t("language.label")}
        </CardTitle>
        <CardDescription>{t("language.change")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {SUPPORTED_LOCALES.map((l) => {
            const active = l.code === locale;
            return (
              <Button
                key={l.code}
                type="button"
                variant={active ? "default" : "outline"}
                className={cn("justify-start gap-2 h-auto py-3")}
                onClick={async () => {
                  if (active) return;
                  await setLocale(l.code);
                  toast.success(t("language.saved"));
                }}
              >
                <span className="text-lg" aria-hidden>{l.flag}</span>
                <span className="font-medium">{l.nativeName}</span>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}