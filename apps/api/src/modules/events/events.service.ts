import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { EventMemberRole, Prisma } from "@prisma/client";
import { DEFAULT_BUDGET_CATEGORIES } from "@mep/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { AccessService } from "../../common/access/access.service";

type EventInput = {
  workspaceId?: number;
  name: string;
  type: string;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  timezone?: string;
  venueName?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  expectedGuests?: number | null;
  currency: string;
  budgetAmount: number;
  notes?: string | null;
  status: "draft" | "planning" | "confirmed" | "in_progress" | "completed" | "cancelled";
};

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** Events visible to the user within a workspace (respects event-level access). */
  async listForWorkspace(userId: bigint, workspaceId: bigint) {
    const role = await this.access.assertWorkspaceRole(userId, workspaceId, [
      "owner",
      "admin",
      "planner",
      "viewer",
    ]);
    const where: Prisma.EventWhereInput =
      role === "owner" || role === "admin"
        ? { workspaceId }
        : { workspaceId, members: { some: { userId } } };
    return this.prisma.event.findMany({
      where,
      include: { _count: { select: { expenses: true, guests: true, tasks: true } } },
      orderBy: [{ startAt: "asc" }, { createdAt: "desc" }],
    });
  }

  async getOne(userId: bigint, eventId: bigint) {
    const event = await this.access.assertEventAccess(userId, eventId);
    const [expenseAgg, payments] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { eventId, status: { notIn: ["cancelled"] } },
        _sum: { totalAmount: true },
      }),
      // Refund-aware: refunds subtract, reversed entries are excluded.
      this.prisma.payment.findMany({
        where: { eventId, reversedAt: null },
        select: { amount: true, type: true },
      }),
    ]);
    const paid = payments.reduce(
      (sum, p) => (p.type === "refund" ? sum - p.amount : sum + p.amount),
      0n,
    );
    return {
      ...event,
      totals: {
        actual: Number(expenseAgg._sum.totalAmount ?? 0),
        paid: Number(paid),
      },
    };
  }

  async create(userId: bigint, input: EventInput) {
    if (!input.workspaceId) throw new BadRequestException("workspaceId is required");
    const workspaceId = BigInt(input.workspaceId);
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin", "planner"]);

    const event = await this.prisma.event.create({
      data: {
        workspaceId,
        name: input.name,
        type: input.type,
        description: input.description ?? null,
        startAt: input.startAt ?? null,
        endAt: input.endAt ?? null,
        timezone: input.timezone ?? "Europe/Berlin",
        venueName: input.venueName ?? null,
        street: input.street ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
        expectedGuests: input.expectedGuests ?? null,
        currency: input.currency,
        budgetAmount: BigInt(input.budgetAmount),
        notes: input.notes ?? null,
        status: input.status,
        ownerId: userId,
        createdById: userId,
        members: { create: { userId, role: "planner" } },
        budgetCategories: {
          create: DEFAULT_BUDGET_CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
        },
      },
    });
    await this.audit.log({
      actorId: userId,
      workspaceId,
      eventId: event.id,
      action: "event.create",
      resourceType: "event",
      resourceId: event.id,
    });
    return event;
  }

  async update(userId: bigint, eventId: bigint, input: Partial<EventInput>) {
    const event = await this.access.assertEventWrite(userId, eventId);

    // Currency lock: once financial entries exist, the currency is frozen.
    if (input.currency && input.currency !== event.currency) {
      const [expenses, payments, budgetItems] = await Promise.all([
        this.prisma.expense.count({ where: { eventId } }),
        this.prisma.payment.count({ where: { eventId } }),
        this.prisma.budgetItem.count({ where: { eventId } }),
      ]);
      if (expenses + payments + budgetItems > 0) {
        throw new ConflictException(
          "The currency can no longer be changed because financial entries already exist",
        );
      }
    }

    const { workspaceId: _ws, ...rest } = input;
    const data: Prisma.EventUpdateInput = { ...rest };
    if (input.budgetAmount !== undefined) data.budgetAmount = BigInt(input.budgetAmount);
    const updated = await this.prisma.event.update({ where: { id: eventId }, data });
    await this.audit.log({
      actorId: userId,
      workspaceId: event.workspaceId,
      eventId,
      action: "event.update",
      resourceType: "event",
      resourceId: eventId,
    });
    return updated;
  }

  /**
   * Delete policy: events with financial records are archived, never deleted,
   * so the financial history is preserved. Only empty events can be deleted.
   */
  async remove(userId: bigint, eventId: bigint) {
    // Destructive: event admin only (workspace owner/admin or event creator).
    const event = await this.access.assertEventAdmin(userId, eventId);
    const financial = await this.prisma.expense.count({ where: { eventId } });
    const payments = await this.prisma.payment.count({ where: { eventId } });
    if (financial + payments > 0) {
      return this.prisma.$transaction(async (tx) => {
        const archived = await tx.event.update({
          where: { id: eventId },
          data: { status: "archived" },
        });
        await this.audit.logTx(tx, {
          actorId: userId,
          workspaceId: event.workspaceId,
          eventId,
          action: "event.archive",
          resourceType: "event",
          resourceId: eventId,
          metadata: { reason: "delete requested with existing financial records" },
        });
        return { archived: true, event: archived };
      });
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.event.delete({ where: { id: eventId } });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "event.delete",
        resourceType: "event",
        resourceId: eventId,
      });
      return { archived: false };
    });
  }

  /** Bring an archived event back to active planning. */
  async restore(userId: bigint, eventId: bigint) {
    const event = await this.access.assertEventAdmin(userId, eventId);
    if (event.status !== "archived") {
      throw new BadRequestException("Only archived events can be restored");
    }
    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.event.update({
        where: { id: eventId },
        data: { status: "planning" },
      });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "event.restore",
        resourceType: "event",
        resourceId: eventId,
      });
      return { archived: false, event: restored };
    });
  }

  // -- Event members ---------------------------------------------------------

  async listMembers(userId: bigint, eventId: bigint) {
    await this.access.assertEventAccess(userId, eventId);
    return this.prisma.eventMember.findMany({
      where: { eventId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async addMember(userId: bigint, eventId: bigint, memberUserId: bigint, role: EventMemberRole) {
    // Membership management: event admin only — planners must not grant
    // access to other users (privilege-escalation surface).
    const event = await this.access.assertEventAdmin(userId, eventId);
    const wsRole = await this.access.getWorkspaceRole(memberUserId, event.workspaceId);
    if (!wsRole) throw new BadRequestException("The user is not a member of this workspace");
    return this.prisma.eventMember.upsert({
      where: { eventId_userId: { eventId, userId: memberUserId } },
      create: { eventId, userId: memberUserId, role },
      update: { role },
    });
  }

  async removeMember(userId: bigint, eventId: bigint, memberId: bigint) {
    await this.access.assertEventAdmin(userId, eventId);
    const member = await this.prisma.eventMember.findUnique({ where: { id: memberId } });
    if (!member || member.eventId !== eventId) throw new NotFoundException("Member not found");
    await this.prisma.eventMember.delete({ where: { id: memberId } });
    return { ok: true };
  }
}
