import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import { SUPPORTED_LOCALES } from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "icon" | "compact";
  className?: string;
}

export function LanguageSwitcher({ variant = "icon", className }: Props) {
  const { locale, setLocale } = useLocale();
  const { t } = useTranslation();

  const current = SUPPORTED_LOCALES.find((l) => l.code === locale);

  const handleSelect = async (code: (typeof SUPPORTED_LOCALES)[number]["code"]) => {
    if (code === locale) return;
    await setLocale(code);
    toast.success(t("language.saved"));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === "icon" ? "icon" : "sm"}
          className={cn("rounded-full", className)}
          aria-label={t("language.change")}
        >
          {variant === "icon" ? (
            <Globe className="h-5 w-5" />
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4" />
              {current?.nativeName ?? locale.toUpperCase()}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => handleSelect(l.code)}
            className={cn(
              "cursor-pointer flex items-center gap-2",
              l.code === locale && "font-semibold text-primary",
            )}
          >
            <span aria-hidden>{l.flag}</span>
            <span>{l.nativeName}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}