import { describe, expect, it } from "vitest";
import {
  computeExpenseStatus,
  outstanding,
  parseMoneyToMinor,
  sumPayments,
  utilisationPercent,
  variance,
} from "./money";

describe("parseMoneyToMinor", () => {
  it("parses plain decimals", () => {
    expect(parseMoneyToMinor("1234.56")).toBe(123456);
    expect(parseMoneyToMinor("0.01")).toBe(1);
    expect(parseMoneyToMinor("10")).toBe(1000);
    expect(parseMoneyToMinor("10.5")).toBe(1050);
  });

  it("accepts currency symbols and grouping spaces", () => {
    expect(parseMoneyToMinor("€ 1.50")).toBe(150);
    expect(parseMoneyToMinor("1,000.00")).toBe(100000);
  });

  it("rejects invalid input", () => {
    expect(parseMoneyToMinor("")).toBeNull();
    expect(parseMoneyToMinor("abc")).toBeNull();
    expect(parseMoneyToMinor("1.234")).toBeNull();
    expect(parseMoneyToMinor("1.2.3")).toBeNull();
  });
});

describe("computeExpenseStatus", () => {
  it("derives status from totals", () => {
    expect(computeExpenseStatus(10000, 0, "unpaid")).toBe("unpaid");
    expect(computeExpenseStatus(10000, 5000, "unpaid")).toBe("partially_paid");
    expect(computeExpenseStatus(10000, 10000, "partially_paid")).toBe("paid");
    expect(computeExpenseStatus(10000, 12000, "partially_paid")).toBe("overpaid");
  });

  it("preserves locked statuses", () => {
    expect(computeExpenseStatus(10000, 5000, "cancelled")).toBe("cancelled");
    expect(computeExpenseStatus(10000, 0, "draft")).toBe("draft");
    expect(computeExpenseStatus(10000, 10000, "disputed")).toBe("disputed");
  });
});

describe("outstanding", () => {
  it("never goes negative", () => {
    expect(outstanding(10000, 5000)).toBe(5000);
    expect(outstanding(10000, 12000)).toBe(0);
  });
});

describe("sumPayments", () => {
  it("nets payments and refunds, ignoring reversed records", () => {
    const rows = [
      { amount: 10000, type: "payment", reversedAt: null },
      { amount: 5000, type: "payment", reversedAt: null },
      { amount: 4000, type: "refund", reversedAt: null },
      { amount: 9999, type: "payment", reversedAt: new Date() },
      { amount: 1111, type: "refund", reversedAt: new Date() },
    ];
    expect(sumPayments(rows)).toEqual({ paid: 15000, refunded: 4000, net: 11000 });
  });

  it("handles empty history", () => {
    expect(sumPayments([])).toEqual({ paid: 0, refunded: 0, net: 0 });
  });
});

describe("computeExpenseStatus with refunds", () => {
  it("becomes refunded when money came back and nothing remains paid", () => {
    expect(computeExpenseStatus(10000, 0, "paid", 10000)).toBe("refunded");
    expect(computeExpenseStatus(10000, 0, "unpaid", 0)).toBe("unpaid");
  });

  it("partial refunds recompute normally", () => {
    expect(computeExpenseStatus(10000, 6000, "paid", 4000)).toBe("partially_paid");
    expect(computeExpenseStatus(10000, 10000, "paid", 2000)).toBe("paid");
  });

  it("recovers from refunded when new payments arrive", () => {
    expect(computeExpenseStatus(10000, 3000, "refunded", 10000)).toBe("partially_paid");
  });
});

describe("utilisationPercent", () => {
  it("computes one-decimal percentages with integer math", () => {
    expect(utilisationPercent(5000, 10000)).toBe(50);
    expect(utilisationPercent(8333, 10000)).toBe(83.3);
    expect(utilisationPercent(12000, 10000)).toBe(120);
  });

  it("returns null when nothing was planned, 100 when unplanned spend exists", () => {
    expect(utilisationPercent(0, 0)).toBeNull();
    expect(utilisationPercent(500, 0)).toBe(100);
  });
});

describe("variance", () => {
  it("is planned minus actual", () => {
    expect(variance(10000, 8000)).toBe(2000);
    expect(variance(10000, 12000)).toBe(-2000);
  });
});
