import { supabase } from "@/integrations/supabase/client";
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, format, parseISO,
} from "date-fns";

export interface LineItemConsumption {
  lineItemId: string;
  serviceName: string;
  frequencyType: string;
  maxOccurrences: number | null; // null = unlimited
  consumed: number;
  isOverScope: boolean;
  periodLabel: string;
}

/**
 * Calculate the current period boundaries for a given frequency_type.
 * PER_VISIT has no period concept (each visit is independent) → returns null.
 */
function getPeriodBounds(
  frequencyType: string,
  contractStart?: string | null,
  contractEnd?: string | null,
): { start: string; end: string; label: string } | null {
  const now = new Date();
  switch (frequencyType) {
    case "PER_WEEK": {
      const s = startOfWeek(now, { weekStartsOn: 1 });
      const e = endOfWeek(now, { weekStartsOn: 1 });
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd"), label: "this week" };
    }
    case "PER_MONTH": {
      const s = startOfMonth(now);
      const e = endOfMonth(now);
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd"), label: "this month" };
    }
    case "PER_YEAR": {
      const s = startOfYear(now);
      const e = endOfYear(now);
      return { start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd"), label: "this year" };
    }
    case "ONE_TIME": {
      return {
        start: contractStart || "2000-01-01",
        end: contractEnd || "2099-12-31",
        label: "contract lifetime",
      };
    }
    default:
      return null; // PER_VISIT — no cap
  }
}

/**
 * Fetch consumption data for all line items in a contract.
 * Returns an array of LineItemConsumption with counts of completed service order items
 * within the current period.
 */
export async function getContractConsumption(
  contractId: string,
  contractStart?: string | null,
  contractEnd?: string | null,
): Promise<LineItemConsumption[]> {
  // 1) Fetch all line items for this contract
  const { data: lineItems } = await supabase
    .from("contract_line_items")
    .select("id, custom_name, frequency_type, max_occurrences_per_period, service_catalog(name)")
    .eq("contract_id", contractId)
    .order("created_at");

  if (!lineItems || lineItems.length === 0) return [];

  // 2) Group by period boundaries and fetch counts
  const results: LineItemConsumption[] = [];

  // Collect all line item ids that have a max to query efficiently
  const lineItemIds = lineItems.map(li => li.id);

  // Fetch all completed & delivered service_order_items for these line items
  // Only count items that were actually delivered (is_completed = true)
  const { data: allItems } = await supabase
    .from("service_order_items")
    .select("contract_line_item_id, is_completed, service_orders!inner(status, performed_date, scheduled_date)")
    .in("contract_line_item_id", lineItemIds)
    .in("service_orders.status", ["COMPLETED"])
    .eq("is_completed", true);

  for (const li of lineItems) {
    const bounds = getPeriodBounds(li.frequency_type, contractStart, contractEnd);
    const serviceName = li.custom_name || (li.service_catalog as any)?.name || "Service";

    if (!bounds || li.max_occurrences_per_period === null) {
      results.push({
        lineItemId: li.id,
        serviceName,
        frequencyType: li.frequency_type,
        maxOccurrences: li.max_occurrences_per_period,
        consumed: 0,
        isOverScope: false,
        periodLabel: bounds?.label || "per visit",
      });
      continue;
    }

    // Count items within the period
    const consumed = (allItems ?? []).filter(item => {
      if (item.contract_line_item_id !== li.id) return false;
      const so = item.service_orders as any;
      const date = so?.performed_date || so?.scheduled_date;
      if (!date) return false;
      return date >= bounds.start && date <= bounds.end;
    }).length;

    results.push({
      lineItemId: li.id,
      serviceName,
      frequencyType: li.frequency_type,
      maxOccurrences: li.max_occurrences_per_period,
      consumed,
      isOverScope: consumed >= li.max_occurrences_per_period,
      periodLabel: bounds.label,
    });
  }

  return results;
}

/**
 * For a specific visit (service order), determine which items are in-scope vs extra.
 * Returns a map of service_order_item_id → { inScope: boolean }.
 */
export async function getVisitScopeStatus(
  visitId: string,
  contractId: string | null,
  contractStart?: string | null,
  contractEnd?: string | null,
): Promise<Map<string, { inScope: boolean; consumed: number; max: number | null; periodLabel: string }>> {
  const result = new Map<string, { inScope: boolean; consumed: number; max: number | null; periodLabel: string }>();

  if (!contractId) return result;

  // Get the visit's items
  const { data: visitItems } = await supabase
    .from("service_order_items")
    .select("id, contract_line_item_id")
    .eq("service_order_id", visitId);

  if (!visitItems || visitItems.length === 0) return result;

  // Get consumption for the contract
  const consumption = await getContractConsumption(contractId, contractStart, contractEnd);
  const consumptionMap = new Map(consumption.map(c => [c.lineItemId, c]));

  for (const item of visitItems) {
    if (!item.contract_line_item_id) {
      // AD_HOC item — always extra
      result.set(item.id, { inScope: false, consumed: 0, max: null, periodLabel: "" });
      continue;
    }

    const c = consumptionMap.get(item.contract_line_item_id);
    if (!c || c.maxOccurrences === null) {
      // No limit → always in scope
      result.set(item.id, { inScope: true, consumed: c?.consumed ?? 0, max: null, periodLabel: c?.periodLabel || "" });
    } else {
      result.set(item.id, {
        inScope: !c.isOverScope,
        consumed: c.consumed,
        max: c.maxOccurrences,
        periodLabel: c.periodLabel,
      });
    }
  }

  return result;
}

/**
 * Get count of over-scope items across all active contracts (for dashboard).
 */
export async function getOverScopeCount(): Promise<number> {
  const { data: activeContracts } = await supabase
    .from("contracts")
    .select("id, start_date, end_date")
    .eq("status", "ACTIVE");

  if (!activeContracts || activeContracts.length === 0) return 0;

  let overCount = 0;
  for (const c of activeContracts) {
    const consumption = await getContractConsumption(c.id, c.start_date, c.end_date);
    overCount += consumption.filter(li => li.isOverScope).length;
  }
  return overCount;
}
