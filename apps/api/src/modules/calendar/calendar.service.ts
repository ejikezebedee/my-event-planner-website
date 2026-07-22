import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { buildCalendarItems, inWindow, type CalendarItem } from "@mep/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";

/**
 * Calendar feed: manual timeline entries merged with auto-generated items
 * derived from tasks, expense due dates, vendor dates and the event itself.
 * Auto items are computed from current records (never persisted), so updates
 * to an underlying record can never create duplicate calendar entries.
 */
@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Merged feed for one event (no access check — callers must authorize). */
  async feedForEvent(eventId: bigint, from?: string, to?: string): Promise<CalendarItem[]> {
    const [timelineEntries, tasks, expenses, eventVendors, event] = await Promise.all([
      this.prisma.timelineEntry.findMany({ where: { eventId } }),
      this.prisma.task.findMany({ where: { eventId } }),
      this.prisma.expense.findMany({ where: { eventId } }),
      this.prisma.eventVendor.findMany({
        where: { eventId },
        include: { vendor: { select: { businessName: true } } },
      }),
      this.prisma.event.findUnique({ where: { id: eventId } }),
    ]);
    const items = buildCalendarItems({ timelineEntries, tasks, expenses, eventVendors, event });
    return inWindow(items, from, to);
  }

  async eventFeed(userId: bigint, eventId: bigint, from?: string, to?: string) {
    await this.access.assertEventAccess(userId, eventId);
    return this.feedForEvent(eventId, from, to);
  }

  /** Workspace-wide feed across every event the user may see. */
  async workspaceFeed(userId: bigint, workspaceId: bigint, from?: string, to?: string) {
    const role = await this.access.assertWorkspaceRole(userId, workspaceId, [
      "owner",
      "admin",
      "planner",
      "viewer",
    ]);
    const eventWhere: Prisma.EventWhereInput =
      role === "owner" || role === "admin"
        ? { workspaceId, status: { not: "archived" } }
        : { workspaceId, status: { not: "archived" }, members: { some: { userId } } };
    const events = await this.prisma.event.findMany({ where: eventWhere, select: { id: true } });

    const feeds = await Promise.all(events.map((e) => this.feedForEvent(e.id, from, to)));
    return feeds
      .flatMap((items, idx) =>
        items.map((item) => ({ ...item, eventId: String(events[idx]!.id) })),
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
}
