/**
 * Single source of truth for scheduling capacity + time-slot ladder.
 * Capacity is a SOFT WARNING (never blocks). If a team exceeds
 * TEAM_DAY_WARNING_THRESHOLD on a given day, surfaces should highlight
 * it (orange in the calendar, "heavy day" flag in the horizon preview,
 * yellow toast on reschedule) but always allow the action.
 */
export const TEAM_DAY_WARNING_THRESHOLD = 4;

export const TIME_SLOTS = [
  { value: "08:00", label: "08:00 – 10:00" },
  { value: "10:00", label: "10:00 – 12:00" },
  { value: "12:00", label: "12:00 – 14:00" },
  { value: "14:00", label: "14:00 – 16:00" },
  { value: "16:00", label: "16:00 – 18:00" },
] as const;

export const TIME_SLOT_VALUES = TIME_SLOTS.map((s) => s.value);