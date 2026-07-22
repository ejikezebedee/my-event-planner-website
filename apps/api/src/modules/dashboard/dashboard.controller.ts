import { Controller, Get, ParseIntPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@ApiTags("dashboard")
@Controller({ path: "dashboard", version: "1" })
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async get(@CurrentUser() user: AuthUser, @Query("workspaceId", ParseIntPipe) workspaceId: number) {
    const wsId = BigInt(workspaceId);
    const role = await this.access.assertWorkspaceRole(user.id, wsId, ["owner", "admin", "planner", "viewer"]);
    const eventWhere: Prisma.EventWhereInput =
      role === "owner" || role === "admin" ? { workspaceId: wsId } : { workspaceId: wsId, members: { some: { userId: user.id } } };

    const events = await this.prisma.event.findMany({
      where: { ...eventWhere, status: { not: "archived" } },
      select: { id: true, name: true, startAt: true, status: true, budgetAmount: true, currency: true },
      orderBy: { startAt: "asc" },
    });
    const eventIds = events.map((e) => e.id);

    const [expenseAgg, paymentAgg, openTasks, overdueExpenses, upcomingTasks, guests] =
      await Promise.all([
        this.prisma.expense.aggregate({
          where: { eventId: { in: eventIds }, status: { notIn: ["cancelled"] } },
          _sum: { totalAmount: true },
        }),
        this.prisma.payment.groupBy({
          by: ["type"],
          where: { eventId: { in: eventIds }, reversedAt: null },
          _sum: { amount: true },
        }),
        this.prisma.task.count({
          where: { eventId: { in: eventIds }, status: { notIn: ["completed", "cancelled"] } },
        }),
        this.prisma.expense.count({
          where: { eventId: { in: eventIds }, dueDate: { lt: new Date() }, status: { in: ["unpaid", "partially_paid"] } },
        }),
        this.prisma.task.findMany({
          where: {
            eventId: { in: eventIds },
            status: { notIn: ["completed", "cancelled"] },
            dueAt: { gte: new Date() },
          },
          orderBy: { dueAt: "asc" },
          take: 5,
          select: { id: true, title: true, dueAt: true, eventId: true, priority: true },
        }),
        this.prisma.guest.count({ where: { eventId: { in: eventIds } } }),
      ]);

    const now = new Date();
    const paidGross = paymentAgg.find((g) => g.type === "payment")?._sum.amount ?? 0n;
    const refundedGross = paymentAgg.find((g) => g.type === "refund")?._sum.amount ?? 0n;
    return {
      events: {
        total: events.length,
        upcoming: events.filter((e) => e.startAt && e.startAt >= now),
      },
      finances: {
        budget: events.reduce((sum, e) => sum + e.budgetAmount, 0n),
        actual: expenseAgg._sum.totalAmount ?? 0n,
        paid: paidGross - refundedGross,
        refunded: refundedGross,
      },
      tasks: { open: openTasks, upcoming: upcomingTasks },
      guests: { total: guests },
      alerts: { overdueExpenses },
    };
  }
}
