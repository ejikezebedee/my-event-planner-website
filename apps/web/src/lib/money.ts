/** Display helpers — formatting only, never arithmetic on floats. */

export function formatMoney(minor: number | null | undefined, currency = "EUR"): string {
  const value = (minor ?? 0) / 100;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
