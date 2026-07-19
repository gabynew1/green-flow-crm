import { addDays, addWeeks, addMonths, startOfWeek, startOfMonth, endOfMonth, format, isBefore, isAfter, parseISO, differenceInCalendarDays } from "date-fns";
import { TIME_SLOT_VALUES, MAX_VISITS_PER_TEAM_PER_DAY } from "./scheduling-constants";

const TIME_SLOTS = TIME_SLOT_VALUES;
const MAX_SLOTS_PER_DAY = MAX_VISITS_PER_TEAM_PER_DAY;

export interface ScheduleInput {
  startDate: string; // yyyy-MM-dd
  endDate: string | null;
  frequencyCount: number;
  frequencyType: string; // "WEEK" | "MONTH"
  teamId: string;
  contractId: string;
  propertyId: string;
  userId: string;
  contractName: string;
  lineItems: Array<{
    id: string;
    service_catalog_id: string;
    name: string;
    quantity: number;
    unit: string | null;
  }>;
  zoneId?: string | null;
}

export interface ScheduledVisit {
  property_id: string;
  contract_id: string;
  team_id: string;
  tenant_id?: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  period_type: "WEEK" | "MONTH";
  period_label: string;
  status: "SCHEDULED";
  created_by_user_id: string;
  notes: string | null;
}

export interface WorkdayChecker {
  isWorkday: (date: Date) => boolean;
}

export interface ExistingVisitMap {
  // key: "YYYY-MM-DD_teamId", value: count of visits
  [key: string]: number;
}

/**
 * Maps "YYYY-MM-DD_teamId" → Set of zoneIds already booked that day.
 * IN-MEMORY ONLY. Never serialize, never store in React Query cache,
 * never send to Supabase. Sets are not JSON-serializable.
 */
export interface ZoneDateMap {
  [key: string]: Set<string>;
}

function getSlotEndTime(startTime: string): string {
  const [h, m] = startTime.split(":").map(Number);
  return `${String(h + 2).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function dateKey(date: Date, teamId: string): string {
  return `${format(date, "yyyy-MM-dd")}_${teamId}`;
}

/**
 * Generates evenly-spaced target dates within a period.
 * For WEEK: N dates spread across Mon-Sat
 * For MONTH: N dates spread across the month
 */
function generateTargetDatesForPeriod(
  periodStart: Date,
  periodEnd: Date,
  count: number
): Date[] {
  const totalDays = differenceInCalendarDays(periodEnd, periodStart) + 1;
  if (count <= 0 || totalDays <= 0) return [];

  const dates: Date[] = [];
  const spacing = totalDays / count;

  for (let i = 0; i < count; i++) {
    const dayOffset = Math.round(spacing * i + spacing / 2 - 0.5);
    const target = addDays(periodStart, Math.min(dayOffset, totalDays - 1));
    dates.push(target);
  }

  return dates;
}

/**
 * Find the next available workday+slot for a team, given existing bookings.
 * Mutates occupancyMap to record the booking.
 */
function findAvailableSlot(
  targetDate: Date,
  teamId: string,
  workdayChecker: WorkdayChecker,
  occupancyMap: ExistingVisitMap,
  maxLookahead: number = 30,
  zoneId?: string | null,
  zoneDateMap?: ZoneDateMap,
): { date: Date; slot: string } | null {
  // Zone clustering pass: prefer a workday within 14 days that already has the
  // same zone booked for this team and still has capacity. Pure hint — never
  // blocks and never drops a visit.
  if (zoneId && zoneDateMap) {
    let zc = targetDate;
    for (let i = 0; i < 14; i++) {
      if (workdayChecker.isWorkday(zc)) {
        const key = dateKey(zc, teamId);
        const currentCount = occupancyMap[key] || 0;
        if (currentCount < MAX_SLOTS_PER_DAY && zoneDateMap[key]?.has(zoneId)) {
          const slot = TIME_SLOTS[currentCount];
          occupancyMap[key] = currentCount + 1;
          if (!zoneDateMap[key]) zoneDateMap[key] = new Set<string>();
          zoneDateMap[key].add(zoneId);
          return { date: zc, slot };
        }
      }
      zc = addDays(zc, 1);
    }
  }

  let candidate = targetDate;
  for (let i = 0; i < maxLookahead; i++) {
    if (workdayChecker.isWorkday(candidate)) {
      const key = dateKey(candidate, teamId);
      const currentCount = occupancyMap[key] || 0;
      if (currentCount < MAX_SLOTS_PER_DAY) {
        const slotIdx = currentCount;
        const slot = TIME_SLOTS[slotIdx];
        // Book it
        occupancyMap[key] = currentCount + 1;
        if (zoneId && zoneDateMap) {
          if (!zoneDateMap[key]) zoneDateMap[key] = new Set<string>();
          zoneDateMap[key].add(zoneId);
        }
        return { date: candidate, slot };
      }
    }
    candidate = addDays(candidate, 1);
  }

  return null;
}

/**
 * Generate all scheduled visits for a contract activation.
 */
export function generateSchedule(
  input: ScheduleInput,
  workdayChecker: WorkdayChecker,
  existingVisitCounts: ExistingVisitMap,
  zoneDateMap: ZoneDateMap = {},
): { visits: ScheduledVisit[]; zoneDateMap: ZoneDateMap; skipped: Array<{ targetDate: string; reason: string }> } {
  const visits: ScheduledVisit[] = [];
  const skipped: Array<{ targetDate: string; reason: string }> = [];
  const occupancy = { ...existingVisitCounts };

  const start = parseISO(input.startDate);
  const end = input.endDate ? parseISO(input.endDate) : addMonths(start, 12);
  const isWeekly = input.frequencyType === "WEEK";

  let periodStart = isWeekly
    ? startOfWeek(start, { weekStartsOn: 1 })
    : startOfMonth(start);

  // Make sure period starts from contract start
  if (isBefore(periodStart, start)) periodStart = start;

  while (isBefore(periodStart, end) || format(periodStart, "yyyy-MM-dd") === format(end, "yyyy-MM-dd")) {
    const periodEnd = isWeekly
      ? addDays(startOfWeek(periodStart, { weekStartsOn: 1 }), 5) // Mon-Sat
      : endOfMonth(periodStart);

    const clampedEnd = isAfter(periodEnd, end) ? end : periodEnd;
    const targets = generateTargetDatesForPeriod(periodStart, clampedEnd, input.frequencyCount);

    for (const target of targets) {
      const result = findAvailableSlot(
        target,
        input.teamId,
        workdayChecker,
        occupancy,
        30,
        input.zoneId ?? null,
        zoneDateMap,
      );
      if (!result) {
        skipped.push({
          targetDate: format(target, "yyyy-MM-dd"),
          reason: `no free slot within 30 days (team at ${MAX_SLOTS_PER_DAY}/day capacity)`,
        });
        continue;
      }

      const dateStr = format(result.date, "yyyy-MM-dd");
      const periodLabel = `${input.contractName} – ${format(result.date, "MMM d, yyyy")}`;

      visits.push({
        property_id: input.propertyId,
        contract_id: input.contractId,
        team_id: input.teamId,
        scheduled_date: dateStr,
        scheduled_start_time: result.slot,
        scheduled_end_time: getSlotEndTime(result.slot),
        period_type: isWeekly ? "WEEK" : "MONTH",
        period_label: periodLabel,
        status: "SCHEDULED",
        created_by_user_id: input.userId,
        notes: null,
      });
    }

    // Advance to next period
    periodStart = isWeekly
      ? addWeeks(periodStart, 1)
      : addMonths(periodStart, 1);

    // Safety: don't generate more than 500 visits
    if (visits.length >= 500) break;
  }

  return { visits, zoneDateMap, skipped };
}
