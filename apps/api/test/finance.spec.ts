import { describe, expect, it } from "vitest";
import { computeExpenseStatus, parseMoneyToMinor } from "@mep/types";

describe("money invariants", () => {
  it("never produces floats for typical inputs", () => {
    for (const input of ["0.01", "9999999999999.99", "10", "0.1", "1,250.00".replace(",", "")]) {
      const minor = parseMoneyToMinor(input);
      expect(Number.isInteger(minor)).toBe(true);
    }
  });

  it("€10.50 parses to 1050 minor units", () => {
    expect(parseMoneyToMinor("10.50")).toBe(1050);
  });
});

describe("expense status transitions", () => {
  it("partial payment yields partially_paid", () => {
    expect(computeExpenseStatus(1000, 400, "unpaid")).toBe("partially_paid");
  });

  it("full payment yields paid", () => {
    expect(computeExpenseStatus(1000, 1000, "partially_paid")).toBe("paid");
  });

  it("overpayment yields overpaid", () => {
    expect(computeExpenseStatus(1000, 1200, "partially_paid")).toBe("overpaid");
  });

  it("reversal back to zero yields unpaid", () => {
    expect(computeExpenseStatus(1000, 0, "paid")).toBe("unpaid");
  });

  it("locked statuses are preserved", () => {
    for (const locked of ["cancelled", "disputed", "draft"]) {
      expect(computeExpenseStatus(1000, 500, locked)).toBe(locked);
    }
  });
});
