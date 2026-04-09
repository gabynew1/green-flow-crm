import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isSunday, parseISO, format } from "date-fns";

export interface GlobalHoliday {
  id: string;
  date: string;
  name: string;
  country_code: string;
}

export interface TenantNonWorkday {
  id: string;
  tenant_id: string;
  date: string;
  title: string;
  created_at: string;
}

export function useWorkdays(tenantId: string | null) {
  const [holidays, setHolidays] = useState<GlobalHoliday[]>([]);
  const [tenantNonWorkdays, setTenantNonWorkdays] = useState<TenantNonWorkday[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [hRes, tRes] = await Promise.all([
      supabase.from("global_holidays").select("*").order("date"),
      supabase.from("tenant_non_workdays").select("*").eq("tenant_id", tenantId).order("date"),
    ]);
    setHolidays((hRes.data as any[]) ?? []);
    setTenantNonWorkdays((tRes.data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const isWorkday = (date: Date): boolean => {
    if (isSunday(date)) return false;
    const dateStr = format(date, "yyyy-MM-dd");
    if (holidays.some(h => h.date === dateStr)) return false;
    if (tenantNonWorkdays.some(d => d.date === dateStr)) return false;
    return true;
  };

  const getNonWorkdayLabel = (date: Date): string | null => {
    if (isSunday(date)) return "Sunday";
    const dateStr = format(date, "yyyy-MM-dd");
    const holiday = holidays.find(h => h.date === dateStr);
    if (holiday) return holiday.name;
    const custom = tenantNonWorkdays.find(d => d.date === dateStr);
    if (custom) return custom.title;
    return null;
  };

  // Tenant non-workdays CRUD
  const addNonWorkday = async (date: string, title: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("tenant_non_workdays").insert({
      tenant_id: tenantId,
      date,
      title,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    } as any);
    if (error) throw error;
    await load();
  };

  const removeNonWorkday = async (id: string) => {
    const { error } = await supabase.from("tenant_non_workdays").delete().eq("id", id);
    if (error) throw error;
    await load();
  };

  const updateNonWorkday = async (id: string, date: string, title: string) => {
    const { error } = await supabase.from("tenant_non_workdays").update({ date, title } as any).eq("id", id);
    if (error) throw error;
    await load();
  };

  // Global holidays CRUD
  const addGlobalHoliday = async (date: string, name: string) => {
    const { error } = await supabase.from("global_holidays").insert({ date, name } as any);
    if (error) throw error;
    await load();
  };

  const updateGlobalHoliday = async (id: string, date: string, name: string) => {
    const { error } = await supabase.from("global_holidays").update({ date, name } as any).eq("id", id);
    if (error) throw error;
    await load();
  };

  const removeGlobalHoliday = async (id: string) => {
    const { error } = await supabase.from("global_holidays").delete().eq("id", id);
    if (error) throw error;
    await load();
  };

  return {
    holidays, tenantNonWorkdays, loading,
    isWorkday, getNonWorkdayLabel,
    addNonWorkday, removeNonWorkday, updateNonWorkday,
    addGlobalHoliday, updateGlobalHoliday, removeGlobalHoliday,
    reload: load,
  };
}
