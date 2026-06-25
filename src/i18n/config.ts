export const SUPPORTED_LOCALES = [
  { code: "ro", nativeName: "Română", flag: "🇷🇴" },
  { code: "en", nativeName: "English", flag: "🇬🇧" },
] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]["code"];

export const FALLBACK_LOCALE: LocaleCode = "ro";

export const LOCALE_STORAGE_KEY = "locale";

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === "string" && SUPPORTED_LOCALES.some((l) => l.code === value);
}