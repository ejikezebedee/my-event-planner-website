import { describe, expect, it } from "vitest";
import { buildCalendarItems, inWindow } from "./calendar";

describe("buildCalendarItems", () => {
  it("merges manual entries with auto items from records", () => {
    const items = buildCalendarItems({
      timelineEntries: [
        { id: 1, title: "Rehearsal dinner", type: "rehearsal", startAt: "2026-08-14T18:00:00Z" },
      ],
      tasks: [
        {
          id: 5,
          title: "Confirm headcount",
          status: "in_progress",
          priority: "high",
          dueAt: "2026-08-01T00:00:00Z",
        },
      ],
      expenses: [
        {
          id: 9,
          title: "Catering balance",
          status: "partially_paid",
          dueDate: "2026-08-10T00:00:00Z",
          totalAmount: 40000,
        },
      ],
      event: {
        id: 1,
        name: "Wedding",
        startAt: "2026-08-15T10:00:00Z",
        endAt: "2026-08-15T23:00:00Z",
      },
    });
    expect(items.map((i) => i.key)).toEqual([
      "task:5",
      "expense:9:due",
      "timeline:1",
      "event:1:start",
    ]);
    expect(items.find((i) => i.key === "timeline:1")?.source).toBe("manual");
    expect(items.find((i) => i.key === "task:5")?.source).toBe("auto");
  });

  it("never duplicates: rebuilt from updated records, keys stay stable", () => {
    const before = buildCalendarItems({
      tasks: [
        {
          id: 5,
          title: "Confirm headcount",
          status: "in_progress",
          priority: "high",
          dueAt: "2026-08-01T00:00:00Z",
        },
      ],
    });
    // Same task after an edit (new title, same id) → same key, still one item.
    const after = buildCalendarItems({
      tasks: [
        {
          id: 5,
          title: "Confirm FINAL headcount",
          status: "blocked",
          priority: "critical",
          dueAt: "2026-08-02T00:00:00Z",
        },
      ],
    });
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect(after[0]!.key).toBe(before[0]!.key);
  });

  it("hides completed tasks and settled expenses", () => {
    const items = buildCalendarItems({
      tasks: [
        {
          id: 1,
          title: "Done",
          status: "completed",
          priority: "low",
          dueAt: "2026-08-01T00:00:00Z",
        },
        {
          id: 2,
          title: "Cancelled",
          status: "cancelled",
          priority: "low",
          dueAt: "2026-08-01T00:00:00Z",
        },
      ],
      expenses: [
        { id: 1, title: "Paid", status: "paid", dueDate: "2026-08-01T00:00:00Z", totalAmount: 100 },
        {
          id: 2,
          title: "Refunded",
          status: "refunded",
          dueDate: "2026-08-01T00:00:00Z",
          totalAmount: 100,
        },
        {
          id: 3,
          title: "Open",
          status: "unpaid",
          dueDate: "2026-08-01T00:00:00Z",
          totalAmount: 100,
        },
      ],
    });
    expect(items.map((i) => i.key)).toEqual(["expense:3:due"]);
  });

  it("includes vendor service and payment dates, skips cancelled vendors", () => {
    const items = buildCalendarItems({
      eventVendors: [
        {
          id: 1,
          serviceDate: "2026-08-15T09:00:00Z",
          paymentDueDate: "2026-08-01T00:00:00Z",
          status: "contracted",
          vendor: { businessName: "Lakeside" },
        },
        {
          id: 2,
          serviceDate: "2026-08-15T09:00:00Z",
          status: "cancelled",
          vendor: { businessName: "Band" },
        },
      ],
    });
    expect(items.map((i) => i.key).sort()).toEqual([
      "eventVendor:1:payment",
      "eventVendor:1:service",
    ]);
  });

  it("falls back to startAt for tasks without a due date", () => {
    const items = buildCalendarItems({
      tasks: [
        {
          id: 7,
          title: "Setup",
          status: "not_started",
          priority: "medium",
          startAt: "2026-08-15T06:00:00Z",
        },
      ],
    });
    expect(items[0]!.startAt).toBe("2026-08-15T06:00:00Z");
    expect(items[0]!.meta?.due).toBe(false);
  });
});

describe("inWindow", () => {
  const items = buildCalendarItems({
    timelineEntries: [
      { id: 1, title: "A", type: "custom", startAt: "2026-08-01T00:00:00Z" },
      { id: 2, title: "B", type: "custom", startAt: "2026-08-15T00:00:00Z" },
      { id: 3, title: "C", type: "custom", startAt: "2026-08-31T00:00:00Z" },
    ],
  });

  it("filters to the requested window", () => {
    expect(inWindow(items, "2026-08-05", "2026-08-20").map((i) => i.title)).toEqual(["B"]);
    expect(inWindow(items).length).toBe(3);
    expect(inWindow(items, undefined, "2026-08-15T00:00:00Z").length).toBe(2);
  });
});
