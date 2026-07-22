import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ExpenseStatus, Prisma } from "@prisma/client";
import { computeExpenseStatus } from "@mep/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";
import { toCsv } from "../../common/utils/csv";
import { minorToDecimalString } from "@mep/types";

type ExpenseInput = {
  title: string;
  description?: string | null;
  categoryId?: number | null;
  budgetItemId?: number | null;
  vendorId?: number | null;
  expenseDate: Date;
  serviceDate?: Date | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  grossOnly?: boolean;
  dueDate?: Date | null;
  paymentMethodSummary?: string | null;
  invoiceNumber?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  version?: number;
};

export type ExpenseListQuery = {
  q?: string;
  status?: string;
  categoryId?: number;
  sort?: string;
};

type PaymentRow = { amount: bigint; type: string; reversedAt: Date | null };

/** Refund-aware sums over active payment records. */
export function paymentSums(payments: PaymentRow[]): {
  paid: bigint;
  refunded: bigint;
  net: bigint;
} {
  let paid = 0n;
  let refunded = 0n;
  for (const p of payments) {
    if (p.reversedAt) continue;
    if (p.type === "refund") refunded += p.amount;
    else paid += p.amount;
  }
  return { paid, refunded, net: paid - refunded };
}

const SORTABLE_FIELDS: Record<string, keyof Prisma.ExpenseOrderByWithRelationInput> = {
  expenseDate: "expenseDate",
  totalAmount: "totalAmount",
  title: "title",
  status: "status",
  dueDate: "dueDate",
  createdAt: "createdAt",
};

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  private buildListArgs(query: ExpenseListQuery): {
    where: Prisma.ExpenseWhereInput;
    orderBy: Prisma.ExpenseOrderByWithRelationInput[];
  } {
    const where: Prisma.ExpenseWhereInput = {};
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
        { invoiceNumber: { contains: query.q, mode: "insensitive" } },
        { referenceNumber: { contains: query.q, mode: "insensitive" } },
      ];
    }
    if (query.status) where.status = query.status as ExpenseStatus;
    if (query.categoryId != null) where.categoryId = BigInt(query.categoryId);

    let orderBy: Prisma.ExpenseOrderByWithRelationInput[] = [
      { expenseDate: "desc" },
      { id: "desc" },
    ];
    if (query.sort) {
      const desc = query.sort.startsWith("-");
      const field = SORTABLE_FIELDS[desc ? query.sort.slice(1) : query.sort];
      if (field) orderBy = [{ [field]: desc ? "desc" : "asc" }, { id: "desc" }];
    }
    return { where, orderBy };
  }

  private serialize(expense: Prisma.ExpenseGetPayload<{ include: { payments: true } }>) {
    const sums = paymentSums(expense.payments);
    const { payments: _omit, ...rest } = expense;
    const outstanding = expense.totalAmount - sums.net;
    return {
      ...rest,
      paid: sums.net,
      refunded: sums.refunded,
      outstanding: outstanding > 0n ? outstanding : 0n,
    };
  }

  async list(userId: bigint, eventId: bigint, query: ExpenseListQuery = {}) {
    await this.access.assertEventAccess(userId, eventId);
    const { where, orderBy } = this.buildListArgs(query);
    const expenses = await this.prisma.expense.findMany({
      where: { ...where, eventId },
      include: { payments: true },
      orderBy,
    });
    return expenses.map((expense) => this.serialize(expense));
  }

  /** CSV export of the (optionally filtered) expense list. */
  async exportCsv(userId: bigint, eventId: bigint, query: ExpenseListQuery = {}) {
    await this.access.assertEventAccess(userId, eventId);
    const rows = await this.list(userId, eventId, query);
    return toCsv(
      [
        "id",
        "title",
        "status",
        "expense_date",
        "due_date",
        "subtotal",
        "tax",
        "total",
        "gross_only",
        "paid",
        "refunded",
        "outstanding",
        "currency",
        "invoice_number",
        "reference_number",
      ],
      rows.map((e) => [
        String(e.id),
        e.title,
        e.status,
        e.expenseDate.toISOString().slice(0, 10),
        e.dueDate ? e.dueDate.toISOString().slice(0, 10) : "",
        minorToDecimalString(Number(e.subtotal)),
        minorToDecimalString(Number(e.taxAmount)),
        minorToDecimalString(Number(e.totalAmount)),
        e.grossOnly ? "yes" : "no",
        minorToDecimalString(Number(e.paid)),
        minorToDecimalString(Number(e.refunded)),
        minorToDecimalString(Number(e.outstanding)),
        e.currency,
        e.invoiceNumber ?? "",
        e.referenceNumber ?? "",
      ]),
    );
  }

  async getOne(userId: bigint, eventId: bigint, expenseId: bigint) {
    await this.access.assertEventAccess(userId, eventId);
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, eventId },
      include: { payments: { orderBy: { paidAt: "asc" } } },
    });
    if (!expense) throw new NotFoundException("Expense not found");
    return expense;
  }

  /** Budget items must belong to the same event as the expense. */
  private async assertBudgetItem(eventId: bigint, budgetItemId?: number | null) {
    if (budgetItemId == null) return;
    const item = await this.prisma.budgetItem.findFirst({
      where: { id: BigInt(budgetItemId), eventId },
    });
    if (!item) throw new BadRequestException("Budget item not found in this event");
  }

  async create(userId: bigint, eventId: bigint, input: ExpenseInput) {
    const event = await this.access.assertEventWrite(userId, eventId);
    await this.assertBudgetItem(eventId, input.budgetItemId);
    // Expense row + audit row commit together (transactional audit).
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          eventId,
          title: input.title,
          description: input.description ?? null,
          categoryId: input.categoryId != null ? BigInt(input.categoryId) : null,
          budgetItemId: input.budgetItemId != null ? BigInt(input.budgetItemId) : null,
          vendorId: input.vendorId != null ? BigInt(input.vendorId) : null,
          expenseDate: input.expenseDate,
          serviceDate: input.serviceDate ?? null,
          subtotal: BigInt(input.subtotal),
          taxAmount: BigInt(input.taxAmount),
          totalAmount: BigInt(input.totalAmount),
          grossOnly: input.grossOnly ?? false,
          currency: event.currency,
          dueDate: input.dueDate ?? null,
          paymentMethodSummary: input.paymentMethodSummary ?? null,
          invoiceNumber: input.invoiceNumber ?? null,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
          status: "unpaid",
          createdById: userId,
        },
      });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "expense.create",
        resourceType: "expense",
        resourceId: expense.id,
        metadata: { totalAmount: input.totalAmount },
      });
      return expense;
    });
  }

  /** Optimistic locking: a stale version is rejected with 409. */
  async update(userId: bigint, eventId: bigint, expenseId: bigint, input: ExpenseInput) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const existing = await this.prisma.expense.findFirst({ where: { id: expenseId, eventId } });
    if (!existing) throw new NotFoundException("Expense not found");
    if (input.version !== undefined && input.version !== existing.version) {
      throw new ConflictException(
        "This expense was changed by someone else. Reload it and apply your changes again.",
      );
    }

    await this.assertBudgetItem(eventId, input.budgetItemId);
    const sums = paymentSums(
      await this.prisma.payment.findMany({ where: { expenseId, reversedAt: null } }),
    );
    const nextStatus = computeExpenseStatus(
      input.totalAmount,
      Number(sums.net),
      existing.status,
      Number(sums.refunded),
    ) as ExpenseStatus;

    // Update + audit row commit together (transactional audit).
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.update({
        where: { id: expenseId },
        data: {
          title: input.title,
          description: input.description ?? null,
          categoryId: input.categoryId != null ? BigInt(input.categoryId) : null,
          budgetItemId: input.budgetItemId != null ? BigInt(input.budgetItemId) : null,
          vendorId: input.vendorId != null ? BigInt(input.vendorId) : null,
          expenseDate: input.expenseDate,
          serviceDate: input.serviceDate ?? null,
          subtotal: BigInt(input.subtotal),
          taxAmount: BigInt(input.taxAmount),
          totalAmount: BigInt(input.totalAmount),
          grossOnly: input.grossOnly ?? false,
          dueDate: input.dueDate ?? null,
          paymentMethodSummary: input.paymentMethodSummary ?? null,
          invoiceNumber: input.invoiceNumber ?? null,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
          status: nextStatus,
          version: { increment: 1 },
        },
      });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "expense.update",
        resourceType: "expense",
        resourceId: expenseId,
      });
      return expense;
    });
  }

  async setStatus(userId: bigint, eventId: bigint, expenseId: bigint, status: ExpenseStatus) {
    const event = await this.access.assertEventWrite(userId, eventId);
    await this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.updateMany({
        where: { id: expenseId, eventId },
        data: { status, version: { increment: 1 } },
      });
      if (expense.count === 0) throw new NotFoundException("Expense not found");
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "expense.set_status",
        resourceType: "expense",
        resourceId: expenseId,
        metadata: { status },
      });
    });
    return { ok: true };
  }

  /**
   * Restore a cancelled expense. The status is recomputed from totals and the
   * refund-aware payment history, so a restored expense never loses track of
   * what was already paid or refunded.
   */
  async restore(userId: bigint, eventId: bigint, expenseId: bigint) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const expense = await this.prisma.expense.findFirst({ where: { id: expenseId, eventId } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.status !== "cancelled") {
      throw new BadRequestException("Only cancelled expenses can be restored");
    }
    const sums = paymentSums(
      await this.prisma.payment.findMany({ where: { expenseId, reversedAt: null } }),
    );
    const status = computeExpenseStatus(
      Number(expense.totalAmount),
      Number(sums.net),
      "unpaid",
      Number(sums.refunded),
    ) as ExpenseStatus;
    await this.prisma.$transaction(async (tx) => {
      await tx.expense.update({
        where: { id: expenseId },
        data: { status, version: { increment: 1 } },
      });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "expense.restore",
        resourceType: "expense",
        resourceId: expenseId,
        metadata: { status },
      });
    });
    return { ok: true, status };
  }

  /**
   * Expenses with payments are never deleted — they are cancelled so the
   * financial history stays intact. Only payment-free expenses are removed.
   */
  async remove(userId: bigint, eventId: bigint, expenseId: bigint) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const paymentCount = await this.prisma.payment.count({ where: { expenseId } });
    if (paymentCount > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.expense.updateMany({
          where: { id: expenseId, eventId },
          data: { status: "cancelled", version: { increment: 1 } },
        });
        await this.audit.logTx(tx, {
          actorId: userId,
          workspaceId: event.workspaceId,
          eventId,
          action: "expense.cancel",
          resourceType: "expense",
          resourceId: expenseId,
          metadata: { reason: "delete requested with existing payments" },
        });
      });
      return { cancelled: true };
    }
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.expense.deleteMany({ where: { id: expenseId, eventId } });
      if (deleted.count === 0) throw new NotFoundException("Expense not found");
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "expense.delete",
        resourceType: "expense",
        resourceId: expenseId,
      });
      return { cancelled: false };
    });
  }
}
