/**
 * Shared visit-status labels + Tailwind color tokens.
 * The 4 canonical statuses are Scheduled / In Progress / Completed / Canceled.
 * Legacy enum values (PENDING_APPROVAL, APPROVED, SENT_TO_CLIENT) still exist
 * in the DB enum but are no longer emitted — they now surface as SCHEDULED
 * plus a `needs_client_action=true` flag.
 */
export const VISIBLE_VISIT_STATUSES = [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELED",
] as const;

export type VisitStatus = (typeof VISIBLE_VISIT_STATUSES)[number] | string;

export const VISIT_STATUS_COLOR: Record<string, string> = {
  SCHEDULED: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-info/10 text-info",
  COMPLETED: "bg-success/10 text-success",
  CANCELED: "bg-destructive/10 text-destructive",
  // Legacy fallbacks — rows shouldn't have these anymore, but map for safety.
  PENDING_APPROVAL: "bg-warning/10 text-warning",
  APPROVED: "bg-success/10 text-success",
  SENT_TO_CLIENT: "bg-accent/10 text-accent",
};

export const VISIT_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELED: "Canceled",
  PENDING_APPROVAL: "Scheduled",
  APPROVED: "Scheduled",
  SENT_TO_CLIENT: "Scheduled",
};

export function visitStatusColor(status: string | null | undefined): string {
  if (!status) return VISIT_STATUS_COLOR.SCHEDULED;
  return VISIT_STATUS_COLOR[status] ?? VISIT_STATUS_COLOR.SCHEDULED;
}

export function visitStatusLabel(status: string | null | undefined): string {
  if (!status) return "Scheduled";
  return VISIT_STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}