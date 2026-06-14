import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  FALLBACK_LOCALE,
  LOCALE_STORAGE_KEY,
  LocaleCode,
  isSupportedLocale,
} from "@/i18n/config";

export function useLocale() {
  const { i18n } = useTranslation();
  const { user } = useAuth();

  const current = (isSupportedLocale(i18n.language)
    ? i18n.language
    : i18n.language?.split("-")[0]) as LocaleCode | undefined;

  const setLocale = useCallback(
    async (next: LocaleCode, opts?: { persistToProfile?: boolean }) => {
      if (!isSupportedLocale(next)) return;
      await i18n.changeLanguage(next);
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (opts?.persistToProfile !== false && user) {
        await (supabase.from("profiles") as any)
          .update({ locale: next })
          .eq("user_id", user.id);
      }
    },
    [i18n, user],
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.from("profiles") as any)
        .select("locale")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileLocale = (data as any)?.locale;
      if (cancelled) return;
      if (isSupportedLocale(profileLocale) && profileLocale !== i18n.language) {
        await i18n.changeLanguage(profileLocale);
        try {
          localStorage.setItem(LOCALE_STORAGE_KEY, profileLocale);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, i18n]);

  return {
    locale: (current ?? FALLBACK_LOCALE) as LocaleCode,
    setLocale,
  };
}