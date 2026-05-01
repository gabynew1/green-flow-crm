import { supabase } from "@/integrations/supabase/client";

export type CloseContractResult = {
  already_closed: boolean;
  canceled_count: number;
  closed_on: string;
  reason: string;
};

/**
 * Closes a contract end-of-day in tenant-local timezone.
 * - Logs an immutable audit entry (with reason + visit snapshot)
 * - Deletes all future visits (scheduled_date > today-in-tenant-tz)
 * - Sets contract.status = CLOSED and end_date = today-in-tenant-tz
 * - Emits in-app notifications (no email)
 * Idempotent for already-closed contracts.
 */
export async function closeContractWithCleanup(
  contractId: string,
  reason: string
): Promise<CloseContractResult> {
  const { data, error } = await supabase.rpc("close_contract_with_cleanup" as any, {
    _contract_id: contractId,
    _reason: reason.trim(),
  });
  if (error) throw error;
  return data as CloseContractResult;
}

/** Returns the tenant timezone, defaulting to Europe/Bucharest. */
export async function getTenantTimezone(tenantId: string): Promise<string> {
  const { data } = await supabase
    .from("tenants")
    .select("timezone")
    .eq("id", tenantId)
    .maybeSingle();
  return ((data as any)?.timezone as string) || "Europe/Bucharest";
}

/** Returns "today" as YYYY-MM-DD in the given IANA timezone. */
export function todayInTimezone(timezone: string): string {
  // en-CA gives YYYY-MM-DD format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Counts visits scheduled strictly after `today` in tenant timezone for a contract. */
export async function countFutureVisitsForContract(
  contractId: string,
  timezone: string
): Promise<{ count: number; today: string }> {
  const today = todayInTimezone(timezone);
  const { count } = await supabase
    .from("service_orders")
    .select("id", { count: "exact", head: true })
    .eq("contract_id", contractId)
    .gt("scheduled_date", today);
  return { count: count ?? 0, today };
}