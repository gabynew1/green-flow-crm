/**
 * Shared document naming.
 * Pattern: Vendor_Property_ServiceType_2aug26.pdf
 */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function slug(part?: string | null): string {
  if (!part) return "";
  return part
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function formatDocDate(date?: string | Date | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (!d || isNaN(d.getTime())) return "";
  return `${d.getDate()}${MONTHS[d.getMonth()]}${String(d.getFullYear()).slice(-2)}`;
}

export type DocNameParts = {
  vendor?: string | null;
  property?: string | null;
  serviceType?: string | null;
  date?: string | Date | null;
  /** Optional leading label, e.g. "Raport" / "Factura" */
  prefix?: string | null;
  /** Optional trailing discriminator, e.g. invoice number */
  suffix?: string | null;
};

export function buildDocFilename(parts: DocNameParts): string {
  const chunks = [
    slug(parts.prefix),
    slug(parts.vendor),
    slug(parts.property),
    slug(parts.serviceType),
    slug(formatDocDate(parts.date)),
    slug(parts.suffix),
  ].filter(Boolean);
  return `${chunks.join("_") || "document"}.pdf`;
}

/** Resolves the human service type used in file names. */
export function resolveServiceType(opts: {
  contractName?: string | null;
  isOneTimeProject?: boolean | null;
  fallback?: string;
}): string {
  if (opts.isOneTimeProject) return "One time Project";
  if (opts.contractName) return opts.contractName;
  return opts.fallback ?? "Ad hoc Visit";
}
