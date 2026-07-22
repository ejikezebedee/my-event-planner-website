import { Injectable, Logger } from "@nestjs/common";
import type { Event, EventVendor, Expense, Payment, Task } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueService } from "../../queue/queue.service";

export interface NotifyInput {
  userId: bigint;
  workspaceId?: bigint | null;
  eventId?: bigint | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
}

export interface NotificationPrefs {
  /** Per-type switches; missing keys default to enabled. */
  types: Record<string, boolean>;
  /** Master switch for email copies of notifications. */
  email: boolean;
}

export const DEFAULT_PREFS: NotificationPrefs = { types: {}, email: false };

const DAY = 24 * 60 * 60 * 1000;
const dayStamp = (d: Date) => d.toISOString().slice(0, 10);

/** All event-scoped data the generator needs — loaded once per event. */
interface EventSignals {
  event: Event;
  openExpenses: (Expense & { payments: Payment[] })[];
  openTasks: Task[];
  budgetActual: bigint;
  links: (EventVendor & { vendor: { businessName: string } })[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("Notifications");

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /** User preferences with defaults applied. */
  async getPrefs(userId: bigint): Promise<NotificationPrefs> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    const raw = (user.notificationPrefs ?? {}) as Partial<NotificationPrefs>;
    return {
      types: { ...(raw.types ?? {}) },
      email: raw.email === true,
    };
  }

  async updatePrefs(userId: bigint, prefs: NotificationPrefs): Promise<NotificationPrefs> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: { types: prefs.types ?? {}, email: prefs.email === true } },
    });
    return this.getPrefs(userId);
  }

  private async isTypeEnabled(userId: bigint, type: string): Promise<boolean> {
    const prefs = await this.getPrefs(userId);
    return prefs.types[type] !== false;
  }

  /**
   * Deduped, preference-aware insert — same (userId, dedupeKey) is stored at
   * most once, and disabled types are skipped entirely. When the user opted
   * into email copies, one is queued (never blocking the request).
   */
  async notify(input: NotifyInput) {
    if (!(await this.isTypeEnabled(input.userId, input.type))) return null;
    try {
      const created = await this.prisma.notification.create({
        data: {
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          eventId: input.eventId ?? null,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
      const prefs = await this.getPrefs(input.userId);
      if (prefs.email) {
        const user = await this.prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true, name: true },
        });
        if (user) {
          await this.queue.enqueueEmail({
            to: user.email,
            subject: `[My Event Planner] ${input.title}`,
            text: `${input.title}\n\n${input.body ?? ""}\n${input.link ?? ""}`.trim(),
          });
        }
      }
      return created;
    } catch {
      // Unique constraint on (userId, dedupeKey) — already notified.
      return null;
    }
  }

  list(userId: bigint) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  unreadCount(userId: bigint) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: bigint, id: bigint) {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(userId: bigint) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async remove(userId: bigint, id: bigint) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /**
   * Generate scheduled notifications for one event and one recipient.
   * Every type uses a period-scoped dedupe key, so the same condition never
   * notifies twice within its period (day or week).
   */
  async generateForEvent(userId: bigint, eventId: bigint): Promise<number> {
    return this.generateFromSignals(userId, await this.loadEventSignals(eventId));
  }

  /** Load every event-scoped query once so multi-recipient passes stay cheap. */
  private async loadEventSignals(eventId: bigint): Promise<EventSignals> {
    const event = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const [openExpenses, openTasks, links] = await Promise.all([
      this.prisma.expense.findMany({
        where: { eventId, status: { in: ["unpaid", "partially_paid"] }, dueDate: { not: null } },
        include: { payments: { where: { reversedAt: null } } },
      }),
      this.prisma.task.findMany({
        where: { eventId, status: { notIn: ["completed", "cancelled"] }, dueAt: { not: null } },
      }),
      this.prisma.eventVendor.findMany({
        where: { eventId, status: { not: "cancelled" }, contractDate: { not: null } },
        include: { vendor: { select: { businessName: true } } },
      }),
    ]);
    let budgetActual = 0n;
    if (event.budgetAmount > 0n) {
      const agg = await this.prisma.expense.aggregate({
        where: { eventId, status: { not: "cancelled" } },
        _sum: { totalAmount: true },
      });
      budgetActual = agg._sum.totalAmount ?? 0n;
    }
    return { event, openExpenses, openTasks, budgetActual, links };
  }

  private async generateFromSignals(userId: bigint, signals: EventSignals): Promise<number> {
    const now = new Date();
    const in3d = new Date(now.getTime() + 3 * DAY);
    const in7d = new Date(now.getTime() + 7 * DAY);
    const today = dayStamp(now);
    let created = 0;
    const { event, openExpenses, openTasks, budgetActual, links } = signals;
    const eventId = event.id;
    const push = async (input: Omit<NotifyInput, "userId" | "eventId">) => {
      const n = await this.notify({ ...input, userId, eventId });
      if (n) created++;
    };

    // Event approaching (weekly key) / starts today (daily key)
    if (event.startAt) {
      if (dayStamp(event.startAt) === today) {
        await push({
          type: "event_starts_today",
          title: `${event.name} starts today`,
          link: `/app/events/${eventId}`,
          dedupeKey: `event_today:${eventId}:${today}`,
        });
      } else if (event.startAt > now && event.startAt <= in7d) {
        await push({
          type: "event_approaching",
          title: `${event.name} is coming up in less than a week`,
          link: `/app/events/${eventId}`,
          dedupeKey: `event_approaching:${eventId}:${dayStamp(event.startAt)}`,
        });
      }
    }

    // Missing important event information (weekly key)
    const missing: string[] = [];
    if (!event.startAt) missing.push("start date");
    if (!event.venueName && !event.city && !event.street) missing.push("venue");
    if (missing.length > 0) {
      await push({
        type: "missing_event_info",
        title: `Missing event information: ${missing.join(", ")}`,
        body: "Complete the event details so planning stays accurate.",
        link: `/app/events/${eventId}`,
        dedupeKey: `missing_info:${eventId}:${missing.join("+")}`,
      });
    }

    // Payments: due soon / overdue (refund-aware outstanding)
    for (const expense of openExpenses) {
      const paid = expense.payments.reduce(
        (s, p) => (p.type === "refund" ? s - p.amount : s + p.amount),
        0n,
      );
      if (expense.totalAmount - paid <= 0n) continue;
      const due = expense.dueDate!;
      if (due < now) {
        await push({
          type: "payment_overdue",
          title: `Payment overdue: ${expense.title}`,
          body: "Outstanding amount is past its due date.",
          link: `/app/events/${eventId}/expenses`,
          dedupeKey: `payment_overdue:${expense.id}:${dayStamp(due)}`,
        });
      } else if (due <= in3d) {
        await push({
          type: "payment_due_soon",
          title: `Payment due soon: ${expense.title}`,
          link: `/app/events/${eventId}/expenses`,
          dedupeKey: `payment_due:${expense.id}:${dayStamp(due)}`,
        });
      }
    }

    // Tasks: due soon / overdue / critical overdue
    for (const task of openTasks) {
      const due = task.dueAt!;
      if (due < now) {
        const critical = task.priority === "critical";
        await push({
          type: critical ? "critical_task_overdue" : "task_overdue",
          title: `${critical ? "Critical task" : "Task"} overdue: ${task.title}`,
          link: `/app/events/${eventId}/tasks`,
          dedupeKey: `task_overdue:${task.id}:${dayStamp(due)}`,
        });
      } else if (due <= in3d) {
        await push({
          type: "task_due_soon",
          title: `Task due soon: ${task.title}`,
          link: `/app/events/${eventId}/tasks`,
          dedupeKey: `task_due:${task.id}:${dayStamp(due)}`,
        });
      }
    }

    // Budget threshold (≥90%) and exceeded (>100%) — one-shot keys
    if (event.budgetAmount > 0n) {
      const actual = budgetActual;
      const percent = Number((actual * 1000n) / event.budgetAmount) / 10;
      if (actual > event.budgetAmount) {
        await push({
          type: "budget_exceeded",
          title: `Budget exceeded for ${event.name} (${percent}%)`,
          link: `/app/events/${eventId}/budget`,
          dedupeKey: `budget_exceeded:${eventId}`,
        });
      } else if (percent >= 90) {
        await push({
          type: "budget_threshold",
          title: `Budget nearly used for ${event.name} (${percent}%)`,
          link: `/app/events/${eventId}/budget`,
          dedupeKey: `budget_threshold:${eventId}`,
        });
      }
    }

    // Vendor contract deadlines (contract date within 3 days or past)
    for (const link of links) {
      const due = link.contractDate!;
      if (due <= in3d) {
        await push({
          type: "vendor_contract_deadline",
          title: `Contract deadline: ${link.vendor.businessName}`,
          link: `/app/events/${eventId}/vendors`,
          dedupeKey: `vendor_contract:${link.id}:${dayStamp(due)}`,
        });
      }
    }

    return created;
  }

  /**
   * One scheduler pass over every active event. Recipients are the event's
   * members plus workspace owners/admins. Returns the number created.
   */
  async runScheduledPass(): Promise<number> {
    const events = await this.prisma.event.findMany({
      where: { status: { not: "archived" } },
      select: {
        id: true,
        workspaceId: true,
        members: { select: { userId: true } },
      },
    });
    // Batch: one query for all workspace owner/admin recipients (avoids N+1).
    const workspaceIds = [...new Set(events.map((e) => e.workspaceId))];
    const admins = workspaceIds.length
      ? await this.prisma.workspaceMember.findMany({
          where: { workspaceId: { in: workspaceIds }, role: { in: ["owner", "admin"] } },
          select: { workspaceId: true, userId: true },
        })
      : [];
    const adminsByWorkspace = new Map<bigint, bigint[]>();
    for (const a of admins) {
      const list = adminsByWorkspace.get(a.workspaceId) ?? [];
      list.push(a.userId);
      adminsByWorkspace.set(a.workspaceId, list);
    }
    let created = 0;
    for (const event of events) {
      const recipients = new Set(event.members.map((m) => m.userId));
      for (const id of adminsByWorkspace.get(event.workspaceId) ?? []) recipients.add(id);
      // Event data is identical for every recipient — load once, fan out.
      const signals = await this.loadEventSignals(event.id);
      for (const userId of recipients) {
        created += await this.generateFromSignals(userId, signals);
      }
    }
    return created;
  }
}
