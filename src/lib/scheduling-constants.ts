/**
 * Single source of truth for scheduling capacity + time-slot ladder.
 * Both the auto-generator (schedule-engine) and manual creation UIs
 * must import from here — never redefine locally.
 */
export const MAX_VISITS_PER_TEAM_PER_DAY = 5;

export const TIME_SLOTS = [
  { value: "08:00", label: "08:00 – 10:00" },
  { value: "10:00", label: "10:00 – 12:00" },
  { value: "12:00", label: "12:00 – 14:00" },
  { value: "14:00", label: "14:00 – 16:00" },
  { value: "16:00", label: "16:00 – 18:00" },
] as const;

export const TIME_SLOT_VALUES = TIME_SLOTS.map((s) => s.value);