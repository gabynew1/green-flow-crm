import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLocale } from "@/hooks/useLocale";

type CategoryMap = Record<string, { label: string; description: string | null }>;
let categoryCache: { locale: string; map: CategoryMap } | null = null;

export function useInventoryCategoryTranslator() {
  const { locale } = useLocale();
  const [map, setMap] = useState<CategoryMap>(() => categoryCache?.map ?? {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (categoryCache && categoryCache.locale === locale) {
        setMap(categoryCache.map);
        return;
      }
      const { data } = await (supabase.from("inventory_category_translations") as any)
        .select("category_code, label, description")
        .eq("locale", locale);
      const m: CategoryMap = {};
      for (const row of ((data as any[]) ?? [])) {
        m[row.category_code] = { label: row.label, description: row.description };
      }
      categoryCache = { locale, map: m };
      if (!cancelled) setMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (code: string) =>
    map[code]?.label ??
    code.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

type ServiceMap = Record<string, { name: string; description: string | null }>;
let serviceCache: { locale: string; map: ServiceMap } | null = null;

export function useServiceCatalogTranslator() {
  const { locale } = useLocale();
  const [map, setMap] = useState<ServiceMap>(() => serviceCache?.map ?? {});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (serviceCache && serviceCache.locale === locale) {
        setMap(serviceCache.map);
        return;
      }
      const { data } = await (supabase.from("service_catalog_translations") as any)
        .select("service_id, name, description")
        .eq("locale", locale);
      const m: ServiceMap = {};
      for (const row of ((data as any[]) ?? [])) {
        m[row.service_id] = { name: row.name, description: row.description };
      }
      serviceCache = { locale, map: m };
      if (!cancelled) setMap(m);
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return (serviceId: string, fallbackName?: string) =>
    map[serviceId]?.name ?? fallbackName ?? "";
}