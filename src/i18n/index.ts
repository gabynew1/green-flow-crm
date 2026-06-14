import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { FALLBACK_LOCALE, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from "./config";

import enCommon from "./locales/en/common.json";
import enAuth from "./locales/en/auth.json";
import enProvider from "./locales/en/provider.json";
import enClient from "./locales/en/client.json";
import enAdmin from "./locales/en/admin.json";
import enValidation from "./locales/en/validation.json";
import enEnums from "./locales/en/enums.json";

import roCommon from "./locales/ro/common.json";
import roAuth from "./locales/ro/auth.json";
import roProvider from "./locales/ro/provider.json";
import roClient from "./locales/ro/client.json";
import roAdmin from "./locales/ro/admin.json";
import roValidation from "./locales/ro/validation.json";
import roEnums from "./locales/ro/enums.json";

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    provider: enProvider,
    client: enClient,
    admin: enAdmin,
    validation: enValidation,
    enums: enEnums,
  },
  ro: {
    common: roCommon,
    auth: roAuth,
    provider: roProvider,
    client: roClient,
    admin: roAdmin,
    validation: roValidation,
    enums: roEnums,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // map en-US -> en
    ns: ["common", "auth", "provider", "client", "admin", "validation", "enums"],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
    },
    react: { useSuspense: false },
  });

// Keep <html lang> in sync
if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.language || FALLBACK_LOCALE;
  i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
  });
}

export default i18n;