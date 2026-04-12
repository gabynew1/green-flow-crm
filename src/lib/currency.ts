export const SUPPORTED_CURRENCIES = [
  { code: "RON", label: "RON – Romanian Leu", locale: "ro-RO" },
  { code: "EUR", label: "EUR – Euro", locale: "de-DE" },
  { code: "USD", label: "USD – US Dollar", locale: "en-US" },
  { code: "GBP", label: "GBP – British Pound", locale: "en-GB" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const LOCALE_MAP: Record<string, string> = Object.fromEntries(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c.locale]),
);

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = "RON",
  maximumFractionDigits = 0,
): string {
  const locale = LOCALE_MAP[currency] || "ro-RO";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(amount);
}
