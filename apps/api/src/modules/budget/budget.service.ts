import { Injectable, NotFoundException } from "@nestjs/common";
import { utilisationPercent, variance } from "@mep/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";

type BudgetItemInput = {
  categoryId: number;
  name: string;
  description?: string | null;
  plannedAmount: number;
  vendorId?: number | null;
  dueDate?: Date | null;
  priority: "low" | "medium" | "high" | "critical";
  notes?: string | null;
};

@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Full budget view: categories with items and live actuals per category. */
  async getBudget(userId: bigint, eventId: bigint) {
    await this.access.assertEventAccess(userId, eventId);
    const [categories, items, expenses] = await Promise.all([
      this.prisma.budgetCategory.findMany({
        where: { eventId },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.budgetItem.findMany({ where: { eventId }, orderBy: { createdAt: "asc" } }),
      this.prisma.expense.findMany({
        where: { eventId, status: { notIn: ["cancelled"] } },
        include: { payments: { where: { reversedAt: null } } },
      }),
    ]);

    const actualByCategory = new Map<string, { actual: bigint; paid: bigint }>();
    const actualByItem = new Map<string, { actual: bigint; paid: bigint }>();
    for (const expense of expenses) {
      // Refund-aware: net paid = payments minus refunds (reversed rows excluded by query)
      const net = expense.payments.reduce(
        (s, p) => (p.type === "refund" ? s - p.amount : s + p.amount),
        0n,
      );
      const key = expense.categoryId?.toString() ?? "uncategorized";
      const entry = actualByCategory.get(key) ?? { actual: 0n, paid: 0n };
      entry.actual += expense.totalAmount;
      entry.paid += net;
      actualByCategory.set(key, entry);
      if (expense.budgetItemId != null) {
        const iKey = expense.budgetItemId.toString();
        const iEntry = actualByItem.get(iKey) ?? { actual: 0n, paid: 0n };
        iEntry.actual += expense.totalAmount;
        iEntry.paid += net;
        actualByItem.set(iKey, iEntry);
      }
    }

    return {
      categories: categories.map((category) => {
        const totals = actualByCategory.get(category.id.toString()) ?? { actual: 0n, paid: 0n };
        const categoryItems = items.filter((i) => i.categoryId === category.id);
        const planned = categoryItems.reduce((s, i) => s + i.plannedAmount, 0n);
        return {
          ...category,
          items: categoryItems.map((item) => {
            const itemTotals = actualByItem.get(item.id.toString()) ?? { actual: 0n, paid: 0n };
            return {
              ...item,
              actual: itemTotals.actual,
              paid: itemTotals.paid,
              variance: variance(Number(item.plannedAmount), Number(itemTotals.actual)),
              utilisationPercent: utilisationPercent(
                Number(itemTotals.actual),
                Number(item.plannedAmount),
              ),
            };
          }),
          planned,
          actual: totals.actual,
          paid: totals.paid,
          remaining: planned - totals.actual,
          variance: variance(Number(planned), Number(totals.actual)),
          utilisationPercent: utilisationPercent(Number(totals.actual), Number(planned)),
        };
      }),
      uncategorized: actualByCategory.get("uncategorized") ?? { actual: 0n, paid: 0n },
    };
  }

  async createCategory(userId: bigint, eventId: bigint, name: string) {
    await this.access.assertEventWrite(userId, eventId);
    const max = await this.prisma.budgetCategory.aggregate({
      where: { eventId },
      _max: { sortOrder: true },
    });
    return this.prisma.budgetCategory.create({
      data: { eventId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
  }

  async deleteCategory(userId: bigint, eventId: bigint, categoryId: bigint) {
    await this.access.assertEventWrite(userId, eventId);
    const itemCount = await this.prisma.budgetItem.count({ where: { categoryId } });
    if (itemCount > 0) {
      // Items are reassigned nowhere — refuse to silently lose budget lines.
      throw new NotFoundException("Category still contains budget items — remove them first");
    }
    await this.prisma.budgetCategory.deleteMany({ where: { id: categoryId, eventId } });
    return { ok: true };
  }

  async upsertItem(userId: bigint, eventId: bigint, input: BudgetItemInput, itemId?: bigint) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const data = {
      eventId,
      categoryId: BigInt(input.categoryId),
      name: input.name,
      description: input.description ?? null,
      plannedAmount: BigInt(input.plannedAmount),
      vendorId: input.vendorId != null ? BigInt(input.vendorId) : null,
      dueDate: input.dueDate ?? null,
      priority: input.priority,
      notes: input.notes ?? null,
    };
    // Budget item + audit row commit together (transactional audit).
    return this.prisma.$transaction(async (tx) => {
      const item = itemId
        ? await tx.budgetItem.update({ where: { id: itemId }, data })
        : await tx.budgetItem.create({ data: { ...data, createdById: userId } });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: itemId ? "budget.update_item" : "budget.create_item",
        resourceType: "budget_item",
        resourceId: item.id,
      });
      return item;
    });
  }

  async deleteItem(userId: bigint, eventId: bigint, itemId: bigint) {
    await this.access.assertEventWrite(userId, eventId);
    await this.prisma.budgetItem.deleteMany({ where: { id: itemId, eventId } });
    return { ok: true };
  }
}
