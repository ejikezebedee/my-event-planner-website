// Calendar feed builder. Pure functions that merge manual timeline entries
// with auto-generated items derived from operational records. Auto items are
// computed from the CURRENT state of each record and keyed by a stable
// source key, so updates to a record can never produce duplicate entries.

export type CalendarKind =
  | "timeline"
  | "task"
  | "expense_due"
  | "payment_due"
  | "event"
  | "vendor_service";

export interface CalendarItem {
  /** Stable dedupe key, e.g. "task:42", "expense:7:due". */
  key: string;
  kind: CalendarKind;
  title: string;
  startAt: string;
  endAt?: string | null;
  source: "manual" | "auto";
  meta?: Record<string, string | number | boolean | null>;
}

export interface CalendarInput {
  timelineEntries?: {
    id: number | bigint;
    title: string;
    type: string;
    startAt: Date | string;
    endAt?: Date | string | null;
  }[];
  tasks?: {
    id: number | bigint;
    title: string;
    status: string;
    priority: string;
    dueAt?: Date | string | null;
    startAt?: Date | string | null;
  }[];
  expenses?: {
    id: number | bigint;
    title: string;
    status: string;
    dueDate?: Date | string | null;
    totalAmount: number | bigint;
  }[];
  eventVendors?: {
    id: number | bigint;
    serviceDate?: Date | string | null;
    paymentDueDate?: Date | string | null;
    status: string;
    vendor?: { businessName: string } | null;
  }[];
  event?: {
    id: number | bigint;
    name: string;
    startAt?: Date | string | null;
    endAt?: Date | string | null;
  } | null;
}

const iso = (d: Date | string): string => (d instanceof Date ? d.toISOString() : d);

/** Task statuses whose due dates still matter on a calendar. */
const OPEN_TASK_STATUSES = new Set(["not_started", "in_progress", "blocked"]);
/** Expense statuses that no longer need a payment deadline. */
const SETTLED_EXPENSE_STATUSES = new Set(["cancelled", "paid", "refunded", "draft"]);
/** Vendor link statuses where dates are no longer relevant. */
const INACTIVE_VENDOR_STATUSES = new Set(["cancelled"]);

export function buildCalendarItems(input: CalendarInput): CalendarItem[] {
  const items = new Map<string, CalendarItem>();
  const put = (item: CalendarItem) => {
    if (!items.has(item.key)) items.set(item.key, item);
  };

  for (const entry of input.timelineEntries ?? []) {
    put({
      key: `timeline:${entry.id}`,
      kind: "timeline",
      title: entry.title,
      startAt: iso(entry.startAt),
      endAt: entry.endAt ? iso(entry.endAt) : null,
      source: "manual",
      meta: { type: entry.type },
    });
  }

  for (const task of input.tasks ?? []) {
    if (!OPEN_TASK_STATUSES.has(task.status)) continue;
    const when = task.dueAt ?? task.startAt;
    if (!when) continue;
    put({
      key: `task:${task.id}`,
      kind: "task",
      title: task.title,
      startAt: iso(when),
      source: "auto",
      meta: { status: task.status, priority: task.priority, due: Boolean(task.dueAt) },
    });
  }

  for (const expense of input.expenses ?? []) {
    if (!expense.dueDate || SETTLED_EXPENSE_STATUSES.has(expense.status)) continue;
    put({
      key: `expense:${expense.id}:due`,
      kind: "expense_due",
      title: `Payment due: ${expense.title}`,
      startAt: iso(expense.dueDate),
      source: "auto",
      meta: { status: expense.status, totalAmount: Number(expense.totalAmount) },
    });
  }

  for (const link of input.eventVendors ?? []) {
    if (INACTIVE_VENDOR_STATUSES.has(link.status)) continue;
    const name = link.vendor?.businessName ?? "Vendor";
    if (link.serviceDate) {
      put({
        key: `eventVendor:${link.id}:service`,
        kind: "vendor_service",
        title: `Service: ${name}`,
        startAt: iso(link.serviceDate),
        source: "auto",
        meta: { status: link.status },
      });
    }
    if (link.paymentDueDate) {
      put({
        key: `eventVendor:${link.id}:payment`,
        kind: "payment_due",
        title: `Vendor payment due: ${name}`,
        startAt: iso(link.paymentDueDate),
        source: "auto",
        meta: { status: link.status },
      });
    }
  }

  if (input.event?.startAt) {
    put({
      key: `event:${input.event.id}:start`,
      kind: "event",
      title: input.event.name,
      startAt: iso(input.event.startAt),
      endAt: input.event.endAt ? iso(input.event.endAt) : null,
      source: "auto",
      meta: null as unknown as undefined,
    });
  }

  return [...items.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** Filter a feed to a [from, to] window (inclusive, ISO strings). */
export function inWindow(items: CalendarItem[], from?: string, to?: string): CalendarItem[] {
  return items.filter((i) => {
    if (from && i.startAt < from && !(i.endAt && i.endAt >= from)) return false;
    if (to && i.startAt > to) return false;
    return true;
  });
}
