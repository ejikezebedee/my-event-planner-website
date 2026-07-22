// Money helpers. All monetary values are integer minor units (€10.50 -> 1050).
// Floating-point arithmetic is never used for money on either side of the API.

/** Convert a user-entered decimal string ("1234.56") to integer minor units. */
export function parseMoneyToMinor(input: string): number | null {
  const trimmed = input.trim().replace(/[,€$£\s]/g, "");
  if (trimmed === "" || trimmed === "-" || trimmed === ".") return null;
  if (!/^-?\d{0,13}(\.\d{0,2})?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [intPartRaw = "", fracRaw = ""] = trimmed.replace("-", "").split(".");
  const intPart = intPartRaw === "" ? 0 : parseInt(intPartRaw, 10);
  const frac = parseInt((fracRaw + "00").slice(0, 2), 10);
  const minor = intPart * 100 + frac;
  return negative ? -minor : minor;
}

/** Format integer minor units as a grouped decimal string, e.g. 123456 -> "1,234.56". */
export function minorToDecimalString(minor: number): string {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const intPart = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${negative ? "-" : ""}${intPart.toLocaleString("en-US")}.${frac
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Derive expense status from totals (all integer minor units).
 * `refundedTotal` is the sum of active refund records; when money came back and
 * nothing remains paid, the expense is "refunded" rather than "unpaid".
 */
export function computeExpenseStatus(
  total: number,
  paid: number,
  current: string,
  refundedTotal = 0,
): string {
  if (current === "cancelled" || current === "disputed" || current === "draft") {
    return current;
  }
  if (paid <= 0) return refundedTotal > 0 ? "refunded" : "unpaid";
  if (paid < total) return "partially_paid";
  if (paid === total) return "paid";
  return "overpaid";
}

/** Outstanding amount: never negative. */
export function outstanding(total: number, paid: number): number {
  return Math.max(total - paid, 0);
}

export interface PaymentLike {
  amount: number;
  type: string;
  reversedAt?: Date | string | null;
}

/**
 * Refund-aware payment aggregation. Reversed records never count.
 * Returns gross payments received, gross refunds issued, and the net paid sum.
 */
export function sumPayments(payments: PaymentLike[]): {
  paid: number;
  refunded: number;
  net: number;
} {
  let paid = 0;
  let refunded = 0;
  for (const p of payments) {
    if (p.reversedAt) continue;
    if (p.type === "refund") refunded += p.amount;
    else paid += p.amount;
  }
  return { paid, refunded, net: paid - refunded };
}

/**
 * Budget utilisation as a percentage with one decimal (e.g. 83.3).
 * Returns null when nothing was planned (ratio undefined). Ratios are not
 * money, but are still derived with integer math only.
 */
export function utilisationPercent(actual: number, planned: number): number | null {
  if (planned <= 0) return actual > 0 ? 100 : null;
  return Math.round((actual * 1000) / planned) / 10;
}

/** Budget variance: planned minus actual. Positive = under budget. */
export function variance(planned: number, actual: number): number {
  return planned - actual;
}
