import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type ExpenseStatus, type PaymentMethod } from "@prisma/client";
import { createHash } from "crypto";
import { computeExpenseStatus } from "@mep/types";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";

type PaymentInput = {
  amount: number;
  paidAt: Date;
  method: PaymentMethod;
  reference?: string | null;
  recipient?: string | null;
  notes?: string | null;
  confirmOverpayment: boolean;
  idempotencyKey?: string;
};

type RefundInput = {
  amount: number;
  paidAt: Date;
  method: PaymentMethod;
  reference?: string | null;
  recipient?: string | null;
  notes?: string | null;
  idempotencyKey?: string;
};

/** Refund-aware sums over a set of payment rows. */
function sums(rows: { amount: bigint; type: string; reversedAt: Date | null }[]) {
  let paid = 0n;
  let refunded = 0n;
  for (const p of rows) {
    if (p.reversedAt) continue;
    if (p.type === "refund") refunded += p.amount;
    else paid += p.amount;
  }
  return { paid, refunded, net: paid - refunded };
}


function idempotencyHash(operation: "payment" | "refund", targetId: bigint, input: PaymentInput | RefundInput): string {
  const payload = JSON.stringify({
    operation,
    targetId: targetId.toString(),
    amount: input.amount,
    paidAt: input.paidAt.toISOString(),
    method: input.method,
    reference: input.reference ?? null,
    recipient: input.recipient ?? null,
    notes: input.notes ?? null,
    confirmOverpayment: "confirmOverpayment" in input ? input.confirmOverpayment : undefined,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Prisma P2002 — unique constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForEvent(userId: bigint, eventId: bigint) {
    await this.access.assertEventAccess(userId, eventId);
    return this.prisma.payment.findMany({
      where: { eventId },
      include: { expense: { select: { id: true, title: true } } },
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    });
  }

  /** Idempotency lookup scoped to the event — never crosses event boundaries. */
  private findByIdempotencyKey(eventId: bigint, key: string) {
    return this.prisma.payment.findUnique({
      where: { eventId_idempotencyKey: { eventId, idempotencyKey: key } },
    });
  }

  /**
   * Record a (partial) payment. Runs in a transaction with optimistic
   * locking on the expense version. Overpayments are rejected unless
   * explicitly confirmed. Idempotent via idempotencyKey — scoped PER EVENT:
   * the same key in another event is a different operation and never returns
   * that event's data. The audit row is written inside the same transaction
   * so a payment can never exist without its audit record.
   */
  async create(userId: bigint, eventId: bigint, expenseId: bigint, input: PaymentInput) {
    const event = await this.access.assertEventWrite(userId, eventId);

    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(eventId, input.idempotencyKey);
      if (existing) {
        const expected = idempotencyHash("payment", expenseId, input);
        if (existing.idempotencyHash !== expected) throw new ConflictException("Idempotency key was already used with a different payment payload");
        return { payment: existing, expenseStatus: null, idempotentReplay: true };
      }
    }

    let result: { payment: { id: bigint }; expenseStatus: ExpenseStatus | null; idempotentReplay: boolean };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const expense = await tx.expense.findFirst({ where: { id: expenseId, eventId } });
        if (!expense) throw new NotFoundException("Expense not found");
        if (expense.status === "cancelled") {
          throw new BadRequestException("Payments cannot be added to a cancelled expense");
        }

        const payments = await tx.payment.findMany({ where: { expenseId, reversedAt: null } });
        const before = sums(payments);
        const newTotal = before.net + BigInt(input.amount);

        if (newTotal > expense.totalAmount && !input.confirmOverpayment) {
          throw new ConflictException(
            "This payment exceeds the outstanding amount. Resubmit with confirmOverpayment=true to record an overpayment.",
          );
        }

        const payment = await tx.payment.create({
          data: {
            expenseId,
            eventId,
            vendorId: expense.vendorId,
            type: "payment",
            amount: BigInt(input.amount),
            currency: expense.currency,
            paidAt: input.paidAt,
            method: input.method,
            reference: input.reference ?? null,
            recipient: input.recipient ?? null,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            idempotencyHash: input.idempotencyKey ? idempotencyHash("payment", expenseId, input) : null,
            createdById: userId,
          },
        });

        const status = computeExpenseStatus(
          Number(expense.totalAmount),
          Number(newTotal),
          expense.status,
          Number(before.refunded),
        ) as ExpenseStatus;
        await tx.expense.update({
          where: { id: expenseId, version: expense.version },
          data: { status, version: { increment: 1 } },
        });

        // Audit row commits with the payment — never one without the other.
        await this.audit.logTx(tx, {
          actorId: userId,
          workspaceId: event.workspaceId,
          eventId,
          action: "payment.create",
          resourceType: "payment",
          resourceId: payment.id,
          metadata: { amount: input.amount, expenseId: String(expenseId) },
        });

        return { payment, expenseStatus: status, idempotentReplay: false };
      });
    } catch (err) {
      // Concurrent retry with the same key: the unique index rejected our
      // insert — return the winning request's record as an idempotent replay.
      if (input.idempotencyKey && isUniqueViolation(err)) {
        const existing = await this.findByIdempotencyKey(eventId, input.idempotencyKey);
        if (existing) {
          const expected = idempotencyHash("payment", expenseId, input);
          if (existing.idempotencyHash !== expected) throw new ConflictException("Idempotency key was already used with a different payment payload");
          return { payment: existing, expenseStatus: null, idempotentReplay: true };
        }
      }
      throw err;
    }

    await this.notifications.notify({
      userId: event.ownerId,
      workspaceId: event.workspaceId,
      eventId,
      type: "payment_recorded",
      title: "Payment recorded",
      body: `A payment was recorded for an expense.`,
      link: `/app/events/${eventId}/payments`,
    });
    return result;
  }

  /**
   * Record a refund against a specific payment. The refund may never exceed
   * what remains refundable on that payment (its amount minus active refunds
   * already recorded). The expense status is recalculated and becomes
   * "refunded" when money came back and nothing remains paid. Idempotent via
   * idempotencyKey; history is preserved (the original payment stays intact).
   */
  async refund(userId: bigint, eventId: bigint, paymentId: bigint, input: RefundInput) {
    const event = await this.access.assertEventWrite(userId, eventId);

    if (input.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(eventId, input.idempotencyKey);
      if (existing) {
        const expected = idempotencyHash("refund", paymentId, input);
        if (existing.idempotencyHash !== expected) throw new ConflictException("Idempotency key was already used with a different refund payload");
        return { refund: existing, expenseStatus: null, idempotentReplay: true };
      }
    }

    let result: {
      refund: { id: bigint; expenseId: bigint };
      expenseStatus: ExpenseStatus | null;
      idempotentReplay: boolean;
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const original = await tx.payment.findFirst({ where: { id: paymentId, eventId } });
        if (!original) throw new NotFoundException("Payment not found");
        if (original.type !== "payment") {
          throw new BadRequestException("Refunds can only be recorded against payments");
        }
        if (original.reversedAt) {
          throw new BadRequestException("A reversed payment cannot be refunded");
        }

        const priorRefunds = await tx.payment.findMany({
          where: { refundOfPaymentId: paymentId, reversedAt: null },
        });
        const refundedSoFar = priorRefunds.reduce((s, r) => s + r.amount, 0n);
        const remaining = original.amount - refundedSoFar;
        if (BigInt(input.amount) > remaining) {
          throw new ConflictException(
            `Refund exceeds the refundable remainder of this payment (${remaining.toString()} minor units left).`,
          );
        }

        const refund = await tx.payment.create({
          data: {
            expenseId: original.expenseId,
            eventId,
            vendorId: original.vendorId,
            type: "refund",
            refundOfPaymentId: paymentId,
            amount: BigInt(input.amount),
            currency: original.currency,
            paidAt: input.paidAt,
            method: input.method,
            reference: input.reference ?? null,
            recipient: input.recipient ?? null,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            idempotencyHash: input.idempotencyKey ? idempotencyHash("refund", paymentId, input) : null,
            createdById: userId,
          },
        });

        const expense = await tx.expense.findUniqueOrThrow({ where: { id: original.expenseId } });
        const all = await tx.payment.findMany({
          where: { expenseId: original.expenseId, reversedAt: null },
        });
        const after = sums(all);
        const status = computeExpenseStatus(
          Number(expense.totalAmount),
          Number(after.net),
          expense.status,
          Number(after.refunded),
        ) as ExpenseStatus;
        await tx.expense.update({
          where: { id: expense.id, version: expense.version },
          data: { status, version: { increment: 1 } },
        });

        // Audit row commits with the refund — never one without the other.
        await this.audit.logTx(tx, {
          actorId: userId,
          workspaceId: event.workspaceId,
          eventId,
          action: "payment.refund",
          resourceType: "payment",
          resourceId: refund.id,
          metadata: {
            amount: input.amount,
            refundOfPaymentId: String(paymentId),
            expenseId: String(refund.expenseId),
          },
        });
        return { refund, expenseStatus: status, idempotentReplay: false };
      });
    } catch (err) {
      if (input.idempotencyKey && isUniqueViolation(err)) {
        const existing = await this.findByIdempotencyKey(eventId, input.idempotencyKey);
        if (existing) {
          const expected = idempotencyHash("refund", paymentId, input);
          if (existing.idempotencyHash !== expected) throw new ConflictException("Idempotency key was already used with a different refund payload");
          return { refund: existing, expenseStatus: null, idempotentReplay: true };
        }
      }
      throw err;
    }

    await this.notifications.notify({
      userId: event.ownerId,
      workspaceId: event.workspaceId,
      eventId,
      type: "refund_recorded",
      title: "Refund recorded",
      body: "A refund was recorded against a payment.",
      link: `/app/events/${eventId}/payments`,
    });
    return result;
  }

  /**
   * Reverse a payment. The payment row is preserved (reversedAt + reason);
   * the expense status is recalculated. History is never erased.
   */
  async reverse(userId: bigint, eventId: bigint, paymentId: bigint, reason: string) {
    const event = await this.access.assertEventWrite(userId, eventId);

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: { id: paymentId, eventId } });
      if (!payment) throw new NotFoundException("Payment not found");
      if (payment.reversedAt) throw new BadRequestException("This payment has already been reversed");

      const expense = await tx.expense.findUniqueOrThrow({ where: { id: payment.expenseId } });
      await tx.payment.update({
        where: { id: paymentId },
        data: { reversedAt: new Date(), reversalReason: reason },
      });

      const remaining = await tx.payment.findMany({
        where: { expenseId: payment.expenseId, reversedAt: null, id: { not: paymentId } },
      });
      const after = sums(remaining);
      const status = computeExpenseStatus(
        Number(expense.totalAmount),
        Number(after.net),
        expense.status,
        Number(after.refunded),
      ) as ExpenseStatus;
      await tx.expense.update({
        where: { id: expense.id, version: expense.version },
        data: { status, version: { increment: 1 } },
      });

      // Audit row commits with the reversal — never one without the other.
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "payment.reverse",
        resourceType: "payment",
        resourceId: paymentId,
        metadata: { reason },
      });
      return { paymentId, expenseStatus: status };
    });

    return result;
  }
}
