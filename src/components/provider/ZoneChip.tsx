import { MapPin } from "lucide-react";

const safeColor = (c?: string | null) =>
  c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#10b981";

interface ZoneChipProps {
  name?: string | null;
  color?: string | null;
  size?: "sm" | "xs";
  showEmpty?: boolean;
  className?: string;
}

/**
 * Compact chip showing a property's Service Zone (color dot + name).
 * Renders a muted "— No zone" placeholder when showEmpty is true and no zone.
 */
export function ZoneChip({ name, color, size = "sm", showEmpty = false, className = "" }: ZoneChipProps) {
  if (!name) {
    if (!showEmpty) return null;
    return (
      <span className={`inline-flex items-center gap-1 text-muted-foreground ${size === "xs" ? "text-[10px]" : "text-xs"} ${className}`}>
        <MapPin className="h-3 w-3" /> No zone
      </span>
    );
  }
  const dot = size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5";
  const text = size === "xs" ? "text-[10px]" : "text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 ${text} ${className}`}
      title={`Zone: ${name}`}
    >
      <span className={`${dot} rounded-full shrink-0`} style={{ backgroundColor: safeColor(color) }} />
      <span className="truncate max-w-[120px]">{name}</span>
    </span>
  );
}

export default ZoneChip;