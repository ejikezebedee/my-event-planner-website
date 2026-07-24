import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { toCsv } from "../../common/utils/csv";
import { renderTablePdf } from "./pdf.util";

export const REPORT_TYPES = [
  "budget_summary",
  "expense_detail",
  "payment_status",
  "guest_list",
  "vendor_summary",
  "task_progress",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportResult {
  columns: string[];
  rows: (string | number)[][];
  totalsRow?: (string | number)[];
  meta: Record<string, unknown>;
}

/** Formats minor units for human-readable report cells (never for math). */
function fmt(minor: bigint | number, currency: string): string {
  const value = typeof minor === "bigint" ? Number(minor) : minor;
  return `${(value / 100).toFixed(2)} ${currency}`;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async generate(userId: bigint, eventId: bigint, type: ReportType): Promise<ReportResult> {
    const event = await this.access.assertEventAccess(userId, eventId);
    const currency = event.currency;

    switch (type) {
      case "budget_summary": {
        const [categories, items, expenses] = await Promise.all([
          this.prisma.budgetCategory.findMany({
            where: { eventId },
            orderBy: { sortOrder: "asc" },
          }),
          this.prisma.budgetItem.findMany({ where: { eventId } }),
          this.prisma.expense.findMany({
            where: { eventId, status: { notIn: ["cancelled"] } },
            include: { payments: { where: { reversedAt: null } } },
          }),
        ]);
        const rows: (string | number)[][] = [];
        let tp = 0n,
          ta = 0n,
          td = 0n;
        for (const cat of categories) {
          const planned = items
            .filter((i) => i.categoryId === cat.id)
            .reduce((s, i) => s + i.plannedAmount, 0n);
          const catExpenses = expenses.filter((e) => e.categoryId === cat.id);
          const actual = catExpenses.reduce((s, e) => s + e.totalAmount, 0n);
          const paid = catExpenses.reduce(
            (s, e) =>
              s +
              e.payments.reduce(
                (ps, p) => (p.type === "refund" ? ps - p.amount : ps + p.amount),
                0n,
              ),
            0n,
          );
          tp += planned;
          ta += actual;
          td += paid;
          rows.push([
            cat.name,
            fmt(planned, currency),
            fmt(actual, currency),
            fmt(paid, currency),
            fmt(planned - actual, currency),
          ]);
        }
        return {
          columns: ["Category", "Planned", "Actual", "Paid", "Remaining"],
          rows,
          totalsRow: [
            "Total",
            fmt(tp, currency),
            fmt(ta, currency),
            fmt(td, currency),
            fmt(tp - ta, currency),
          ],
          meta: { event: event.name, budgetAmount: fmt(event.budgetAmount, currency) },
        };
      }

      case "expense_detail": {
        const expenses = await this.prisma.expense.findMany({
          where: { eventId },
          include: { payments: { where: { reversedAt: null } } },
          orderBy: { expenseDate: "asc" },
        });
        const rows = expenses.map((e) => {
          const paid = e.payments.reduce(
            (s, p) => (p.type === "refund" ? s - p.amount : s + p.amount),
            0n,
          );
          const outstanding = e.totalAmount - paid > 0n ? e.totalAmount - paid : 0n;
          return [
            e.title,
            e.expenseDate.toISOString().slice(0, 10),
            fmt(e.subtotal, currency),
            fmt(e.taxAmount, currency),
            fmt(e.totalAmount, currency),
            fmt(paid, currency),
            fmt(outstanding, currency),
            e.status,
          ];
        });
        return {
          columns: ["Expense", "Date", "Subtotal", "Tax", "Total", "Paid", "Outstanding", "Status"],
          rows,
          meta: { event: event.name },
        };
      }

      case "payment_status": {
        const payments = await this.prisma.payment.findMany({
          where: { eventId },
          include: { expense: { select: { title: true } } },
          orderBy: { paidAt: "asc" },
        });
        return {
          columns: [
            "Expense",
            "Type",
            "Paid At",
            "Amount",
            "Method",
            "Reference",
            "State",
            "Reversal Reason",
          ],
          rows: payments.map((p) => [
            p.expense.title,
            p.type,
            p.paidAt.toISOString().slice(0, 10),
            fmt(p.type === "refund" ? -p.amount : p.amount, currency),
            p.method,
            p.reference ?? "",
            p.reversedAt ? "reversed" : "active",
            p.reversalReason ?? "",
          ]),
          meta: { event: event.name },
        };
      }

      case "guest_list": {
        const guests = await this.prisma.guest.findMany({
          where: { eventId },
          include: { group: { select: { name: true } } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        });
        return {
          columns: [
            "Name",
            "Email",
            "Group",
            "Accompanying",
            "Invitation",
            "RSVP",
            "Attendance",
            "Table",
          ],
          rows: guests.map((g) => [
            `${g.firstName} ${g.lastName}`,
            g.email ?? "",
            g.group?.name ?? "",
            g.accompanyingCount,
            g.invitationStatus,
            g.rsvpStatus,
            g.attendanceStatus,
            g.tableName ?? "",
          ]),
          meta: { event: event.name, total: guests.length },
        };
      }

      case "vendor_summary": {
        const [links, payments] = await Promise.all([
          this.prisma.eventVendor.findMany({ where: { eventId }, include: { vendor: true } }),
          this.prisma.payment.findMany({
            where: { eventId, reversedAt: null, vendorId: { not: null } },
            select: { vendorId: true, amount: true, type: true },
          }),
        ]);
        return {
          columns: ["Vendor", "Category", "Status", "Quoted", "Agreed", "Paid", "Payment Due"],
          rows: links.map((l) => {
            const paid = payments
              .filter((p) => p.vendorId === l.vendorId)
              .reduce((s, p) => (p.type === "refund" ? s - p.amount : s + p.amount), 0n);
            return [
              l.vendor.businessName,
              l.vendor.serviceCategory ?? "",
              l.status,
              l.quotedAmount != null ? fmt(l.quotedAmount, currency) : "",
              l.agreedAmount != null ? fmt(l.agreedAmount, currency) : "",
              fmt(paid, currency),
              l.paymentDueDate ? l.paymentDueDate.toISOString().slice(0, 10) : "",
            ];
          }),
          meta: { event: event.name },
        };
      }

      case "task_progress": {
        const tasks = await this.prisma.task.findMany({
          where: { eventId },
          orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
        });
        const done = tasks.filter((t) => t.status === "completed").length;
        return {
          columns: ["Task", "Category", "Priority", "Status", "Due", "Completed At"],
          rows: tasks.map((t) => [
            t.title,
            t.category ?? "",
            t.priority,
            t.status,
            t.dueAt ? t.dueAt.toISOString().slice(0, 10) : "",
            t.completedAt ? t.completedAt.toISOString().slice(0, 10) : "",
          ]),
          meta: { event: event.name, total: tasks.length, completed: done },
        };
      }

      default:
        throw new BadRequestException(`Unknown report type: ${type}`);
    }
  }

  async asCsv(userId: bigint, eventId: bigint, type: ReportType): Promise<string> {
    const report = await this.generate(userId, eventId, type);
    const rows = report.totalsRow ? [...report.rows, report.totalsRow] : report.rows;
    return toCsv(report.columns, rows);
  }

  async asPdf(userId: bigint, eventId: bigint, type: ReportType): Promise<Buffer> {
    const event = await this.access.assertEventAccess(userId, eventId);
    const report = await this.generate(userId, eventId, type);
    return renderTablePdf({
      title: `${event.name} — ${type.replace(/_/g, " ")}`,
      subtitle: `Event currency: ${event.currency}`,
      columns: report.columns,
      rows: report.rows,
      totalsRow: report.totalsRow,
      summary: this.summaryFor(type, report),
    });
  }

  /** Short summary section appended to every PDF report. */
  private summaryFor(_type: ReportType, report: ReportResult): string[] {
    const lines = [`${report.rows.length} record(s) in this report.`];
    if (report.totalsRow) {
      const cells = report.columns
        .map((col, i) => ({ col, value: report.totalsRow![i] }))
        .filter(
          (c) =>
            c.value !== "" &&
            c.value != null &&
            c.col.toLowerCase() !== "expense" &&
            c.col.toLowerCase() !== "task",
        );
      for (const c of cells.slice(0, 6)) lines.push(`Total ${c.col}: ${c.value}`);
    }
    return lines;
  }
}
