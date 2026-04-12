import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  startOfMonth, endOfMonth, startOfYear, endOfYear, format, parseISO,
  startOfWeek, endOfWeek, isWithinInterval, addMonths, differenceInWeeks, differenceInMonths,
} from "date-fns";
import {
  BarChart3, Calendar, TrendingUp, Receipt, CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { getContractConsumption, LineItemConsumption } from "@/lib/contract-consumption";

interface CustomerDashboardProps {
  customerId: string;
  contracts: any[];
  visits: any[];
}

export function CustomerDashboard({ customerId, contracts, visits }: CustomerDashboardProps) {
  const [allLineItems, setAllLineItems] = useState<any[]>([]);
  const [consumptionData, setConsumptionData] = useState<Map<string, LineItemConsumption[]>>(new Map());

  const activeContracts = useMemo(
    () => contracts.filter(c => c.status === "ACTIVE" || c.status === "SIGNED"),
    [contracts],
  );

  useEffect(() => {
    loadData();
  }, [contracts]);

  const loadData = async () => {
    if (activeContracts.length === 0) { setAllLineItems([]); return; }
    const contractIds = activeContracts.map(c => c.id);
    const { data: lines } = await supabase
      .from("contract_line_items")
      .select("*, service_catalog(name)")
      .in("contract_id", contractIds);
    setAllLineItems(lines ?? []);

    // Get consumption per contract
    const cMap = new Map<string, LineItemConsumption[]>();
    for (const c of activeContracts) {
      const consumption = await getContractConsumption(c.id, c.start_date, c.end_date);
      cMap.set(c.id, consumption);
    }
    setConsumptionData(cMap);
  };

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = startOfYear(now);
  const yearEnd = endOfYear(now);
  const nextMonthStart = startOfMonth(addMonths(now, 1));
  const nextMonthEnd = endOfMonth(addMonths(now, 1));

  // ── Delivery Metrics ──
  const completedVisits = visits.filter(v => v.status === "COMPLETED");
  const allScheduled = visits.filter(v => v.status === "SCHEDULED");
  const completedThisMonth = completedVisits.filter(v => {
    const d = v.performed_date || v.scheduled_date;
    return d && isWithinInterval(parseISO(d), { start: monthStart, end: monthEnd });
  });
  const completedThisYear = completedVisits.filter(v => {
    const d = v.performed_date || v.scheduled_date;
    return d && isWithinInterval(parseISO(d), { start: yearStart, end: yearEnd });
  });
  const scheduledThisMonth = allScheduled.filter(v => {
    return v.scheduled_date &&
      isWithinInterval(parseISO(v.scheduled_date), { start: monthStart, end: monthEnd });
  });
  const scheduledNextMonth = allScheduled.filter(v => {
    return v.scheduled_date &&
      isWithinInterval(parseISO(v.scheduled_date), { start: nextMonthStart, end: nextMonthEnd });
  });
  const overdueVisits = allScheduled.filter(v => {
    return v.scheduled_date && parseISO(v.scheduled_date) < monthStart;
  });
  // Calculate contractual monthly visit obligation from active contracts
  let contractualMonthlyVisits = 0;
  for (const c of activeContracts) {
    const vfc = c.visit_frequency_count || 0;
    const vft = c.visit_frequency_type;
    if (vft === "WEEK") contractualMonthlyVisits += vfc * 4.33;
    else if (vft === "MONTH") contractualMonthlyVisits += vfc;
  }
  const expectedThisMonth = Math.round(contractualMonthlyVisits);
  const totalPlannedThisMonth = Math.max(expectedThisMonth, completedThisMonth.length + scheduledThisMonth.length);

  // Calculate total expected visits across full contract duration
  let totalExpectedVisits = 0;
  for (const c of activeContracts) {
    const vfc = c.visit_frequency_count || 0;
    const vft = c.visit_frequency_type;
    const cStart = c.start_date ? parseISO(c.start_date) : now;
    const cEnd = c.end_date ? parseISO(c.end_date) : addMonths(now, 12);
    if (vft === "WEEK") {
      totalExpectedVisits += vfc * Math.max(differenceInWeeks(cEnd, cStart), 1);
    } else if (vft === "MONTH") {
      totalExpectedVisits += vfc * Math.max(differenceInMonths(cEnd, cStart), 1);
    }
  }
  const totalDeliveredOrScheduled = completedVisits.length + allScheduled.length;

  // ── Financial Metrics ──
  const contractLinesByContract = new Map<string, any[]>();
  for (const li of allLineItems) {
    const arr = contractLinesByContract.get(li.contract_id) || [];
    arr.push(li);
    contractLinesByContract.set(li.contract_id, arr);
  }

  // Total annual contract value
  let totalContractValue = 0;
  for (const c of activeContracts) {
    const lines = contractLinesByContract.get(c.id) || [];
    for (const li of lines) {
      const lineTotal = (li.unit_price || 0) * (li.quantity || 1);
      const freq = li.frequency_type;
      if (freq === "PER_WEEK") totalContractValue += lineTotal * 52;
      else if (freq === "PER_MONTH") totalContractValue += lineTotal * 12;
      else if (freq === "PER_VISIT") {
        const vfc = c.visit_frequency_count || 1;
        const vft = c.visit_frequency_type;
        if (vft === "WEEK") totalContractValue += lineTotal * vfc * 52;
        else if (vft === "MONTH") totalContractValue += lineTotal * vfc * 12;
        else totalContractValue += lineTotal;
      }
      else totalContractValue += lineTotal;
    }
  }

  // Monthly contract value
  let monthlyContractValue = 0;
  for (const c of activeContracts) {
    const lines = contractLinesByContract.get(c.id) || [];
    for (const li of lines) {
      const lineTotal = (li.unit_price || 0) * (li.quantity || 1);
      const freq = li.frequency_type;
      if (freq === "PER_WEEK") monthlyContractValue += lineTotal * 4.33;
      else if (freq === "PER_MONTH") monthlyContractValue += lineTotal;
      else if (freq === "PER_VISIT") {
        const vfc = c.visit_frequency_count || 1;
        const vft = c.visit_frequency_type;
        if (vft === "WEEK") monthlyContractValue += lineTotal * vfc * 4.33;
        else if (vft === "MONTH") monthlyContractValue += lineTotal * vfc;
        else monthlyContractValue += lineTotal / 12;
      }
      else monthlyContractValue += lineTotal / 12;
    }
  }

  // Count ad-hoc items from completed visits this month/year
  const getAdHocItemCount = (visitList: any[]) => {
    // We'll approximate — proper calculation would need service_order_items
    return visitList.filter(v => v.status === "COMPLETED").length;
  };

  // Consumption overview per service
  const allConsumption: LineItemConsumption[] = [];
  for (const [_, items] of consumptionData) {
    allConsumption.push(...items.filter(i => i.maxOccurrences !== null));
  }
  const overScopeItems = allConsumption.filter(i => i.isOverScope);

  // Format currency
  const fmt = (n: number) => new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(n);

  if (activeContracts.length === 0 && visits.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" /> Customer Overview
      </h2>

      {/* ── Row 1: Delivery vs Plan ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Delivery Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Overdue */}
            {overdueVisits.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-[11px] text-destructive uppercase tracking-wide font-medium">Overdue</p>
                <p className="text-2xl font-bold mt-1 text-destructive">{overdueVisits.length}</p>
                <p className="text-xs text-destructive/70">past due date</p>
              </div>
            )}

            {/* This Month */}
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">This Month</p>
              <p className="text-2xl font-bold mt-1">
                {completedThisMonth.length}
                <span className="text-sm font-normal text-muted-foreground">/{totalPlannedThisMonth}</span>
              </p>
              <p className="text-xs text-muted-foreground">delivered</p>
              {totalPlannedThisMonth > 0 && (
                <Progress
                  value={(completedThisMonth.length / totalPlannedThisMonth) * 100}
                  className="h-1.5 mt-2"
                />
              )}
            </div>

            {/* Next Month */}
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Next Month</p>
              <p className="text-2xl font-bold mt-1">{scheduledNextMonth.length}</p>
              <p className="text-xs text-muted-foreground">scheduled</p>
            </div>

            {/* Total Upcoming */}
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Scheduled</p>
              <p className="text-2xl font-bold mt-1 text-primary">
                {allScheduled.length}
                {totalExpectedVisits > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">/{totalExpectedVisits}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">visits planned</p>
              {totalExpectedVisits > 0 && (
                <Progress
                  value={(totalDeliveredOrScheduled / totalExpectedVisits) * 100}
                  className="h-1.5 mt-2"
                />
              )}
            </div>

            {/* YTD Completed */}
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Year to Date</p>
              <p className="text-2xl font-bold mt-1">{completedThisYear.length}</p>
              <p className="text-xs text-muted-foreground">visits completed</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Row 2: Financial Overview ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Total Contract Value */}
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Annual Contract Value</p>
              <p className="text-xl font-bold mt-1 text-primary">{fmt(totalContractValue)}</p>
              <p className="text-xs text-muted-foreground">{activeContracts.length} active contract{activeContracts.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Monthly Billing */}
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Monthly Billing</p>
              <p className="text-xl font-bold mt-1">{fmt(monthlyContractValue)}</p>
              <p className="text-xs text-muted-foreground">contracted amount</p>
            </div>

            {/* YTD Revenue */}
            <div className="rounded-lg border p-3 col-span-2 sm:col-span-1">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">YTD Revenue</p>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-xl font-bold">{fmt(monthlyContractValue * now.getMonth())}</p>
              </div>
              <div className="flex gap-3 mt-1.5">
                <span className="flex items-center gap-1 text-[10px]">
                  <span className="h-2 w-2 rounded-full bg-primary inline-block" />
                  Contract
                </span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className="h-2 w-2 rounded-full bg-warning inline-block" />
                  Ad-hoc
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Row 3: Service Consumption ── */}
      {allConsumption.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Service Consumption
              {overScopeItems.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
                  <AlertTriangle className="h-3 w-3" /> {overScopeItems.length} over limit
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {allConsumption.map((item, i) => {
                const pct = item.maxOccurrences ? Math.min((item.consumed / item.maxOccurrences) * 100, 100) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.serviceName}</span>
                        <span className="text-xs text-muted-foreground">{item.periodLabel}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {item.consumed}/{item.maxOccurrences}
                        </span>
                        {item.isOverScope ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Over</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-success border-success/30">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" /> OK
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Progress
                      value={pct}
                      className={`h-2 ${item.isOverScope ? "[&>div]:bg-destructive" : ""}`}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
