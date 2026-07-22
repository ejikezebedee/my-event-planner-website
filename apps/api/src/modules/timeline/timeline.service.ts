import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { CalendarService } from "../calendar/calendar.service";

type TimelineInput = {
  title: string;
  type: string;
  startAt: Date;
  endAt?: Date | null;
  notes?: string | null;
};

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly calendar: CalendarService,
  ) {}

  /**
   * Manual entries plus auto-generated items from operational records
   * (task due dates, payment deadlines, vendor services, event dates).
   * Auto items are computed on read — an updated record can never produce
   * a duplicate timeline item.
   */
  async list(userId: bigint, eventId: bigint) {
    await this.access.assertEventAccess(userId, eventId);
    const feed = await this.calendar.feedForEvent(eventId);
    return feed.map((item) => ({
      id: item.source === "manual" ? Number(item.key.split(":")[1]) : item.key,
      title: item.title,
      type: item.source === "manual" ? String(item.meta?.type ?? "custom") : item.kind,
      startAt: item.startAt,
      endAt: item.endAt ?? null,
      notes: null,
      source: item.source,
      meta: item.meta ?? null,
    }));
  }

  async create(userId: bigint, eventId: bigint, input: TimelineInput) {
    await this.access.assertEventWrite(userId, eventId);
    return this.prisma.timelineEntry.create({
      data: {
        eventId,
        title: input.title,
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        notes: input.notes ?? null,
        createdById: userId,
      },
    });
  }

  async update(userId: bigint, eventId: bigint, entryId: bigint, input: TimelineInput) {
    await this.access.assertEventWrite(userId, eventId);
    const updated = await this.prisma.timelineEntry.updateMany({
      where: { id: entryId, eventId },
      data: {
        title: input.title,
        type: input.type,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        notes: input.notes ?? null,
      },
    });
    if (updated.count === 0) throw new NotFoundException("Timeline entry not found");
    return { ok: true };
  }

  async remove(userId: bigint, eventId: bigint, entryId: bigint) {
    await this.access.assertEventWrite(userId, eventId);
    await this.prisma.timelineEntry.deleteMany({ where: { id: entryId, eventId } });
    return { ok: true };
  }
}
