import { Injectable, NotFoundException } from "@nestjs/common";
import type { VendorStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";

type VendorInput = {
  businessName: string;
  contactPerson?: string | null;
  serviceCategory?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  taxNumber?: string | null;
  notes?: string | null;
};

type EventVendorInput = {
  vendorId: number;
  serviceDescription?: string | null;
  quotedAmount?: number | null;
  agreedAmount?: number | null;
  depositRequired?: number | null;
  contractDate?: Date | null;
  serviceDate?: Date | null;
  paymentDueDate?: Date | null;
  status: VendorStatus;
  rating?: number | null;
  notes?: string | null;
};

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async listWorkspaceVendors(
    userId: bigint,
    workspaceId: bigint,
    filter: { q?: string; category?: string; includeArchived?: boolean } = {},
  ) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin", "planner", "viewer"]);
    return this.prisma.vendor.findMany({
      where: {
        workspaceId,
        archived: filter.includeArchived ? undefined : false,
        serviceCategory: filter.category
          ? { equals: filter.category, mode: "insensitive" }
          : undefined,
        OR: filter.q
          ? [
              { businessName: { contains: filter.q, mode: "insensitive" } },
              { contactPerson: { contains: filter.q, mode: "insensitive" } },
              { email: { contains: filter.q, mode: "insensitive" } },
              { city: { contains: filter.q, mode: "insensitive" } },
            ]
          : undefined,
      },
      orderBy: { businessName: "asc" },
    });
  }

  /**
   * Vendor detail with a financial summary across every event link:
   * quoted/agreed totals and the refund-aware net amount actually paid.
   */
  async getVendorSummary(userId: bigint, workspaceId: bigint, vendorId: bigint) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin", "planner", "viewer"]);
    const vendor = await this.prisma.vendor.findFirst({ where: { id: vendorId, workspaceId } });
    if (!vendor) throw new NotFoundException("Vendor not found");
    const [links, payments] = await Promise.all([
      this.prisma.eventVendor.findMany({
        where: { vendorId },
        include: { event: { select: { id: true, name: true, startAt: true, status: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.payment.findMany({
        where: { vendorId, reversedAt: null },
        select: { amount: true, type: true },
      }),
    ]);
    const paid = payments.reduce(
      (s, p) => (p.type === "refund" ? s - p.amount : s + p.amount),
      0n,
    );
    return {
      ...vendor,
      links,
      summary: {
        events: links.length,
        quoted: links.reduce((s, l) => s + (l.quotedAmount ?? 0n), 0n),
        agreed: links.reduce((s, l) => s + (l.agreedAmount ?? 0n), 0n),
        paid,
      },
    };
  }

  async createVendor(userId: bigint, workspaceId: bigint, input: VendorInput) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin", "planner"]);
    const vendor = await this.prisma.vendor.create({
      data: { ...input, workspaceId, createdById: userId },
    });
    await this.audit.log({ actorId: userId, workspaceId, action: "vendor.create", resourceType: "vendor", resourceId: vendor.id });
    return vendor;
  }

  async updateVendor(userId: bigint, workspaceId: bigint, vendorId: bigint, input: VendorInput) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin", "planner"]);
    const updated = await this.prisma.vendor.updateMany({ where: { id: vendorId, workspaceId }, data: input });
    if (updated.count === 0) throw new NotFoundException("Vendor not found");
    return { ok: true };
  }

  async archiveVendor(userId: bigint, workspaceId: bigint, vendorId: bigint) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin", "planner"]);
    await this.prisma.vendor.updateMany({ where: { id: vendorId, workspaceId }, data: { archived: true } });
    await this.audit.log({ actorId: userId, workspaceId, action: "vendor.archive", resourceType: "vendor", resourceId: vendorId });
    return { ok: true };
  }

  /** Vendors linked to an event, including live payment totals per vendor. */
  async listEventVendors(userId: bigint, eventId: bigint) {
    await this.access.assertEventAccess(userId, eventId);
    const [links, payments] = await Promise.all([
      this.prisma.eventVendor.findMany({
        where: { eventId },
        include: { vendor: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.payment.findMany({
        where: { eventId, reversedAt: null, vendorId: { not: null } },
        select: { vendorId: true, amount: true, type: true },
      }),
    ]);
    const paidByVendor = new Map<string, bigint>();
    for (const p of payments) {
      const key = p.vendorId!.toString();
      const signed = p.type === "refund" ? -p.amount : p.amount;
      paidByVendor.set(key, (paidByVendor.get(key) ?? 0n) + signed);
    }
    return links.map((link) => ({
      ...link,
      paid: paidByVendor.get(link.vendorId.toString()) ?? 0n,
    }));
  }

  async upsertEventVendor(userId: bigint, eventId: bigint, input: EventVendorInput, linkId?: bigint) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const data = {
      eventId,
      vendorId: BigInt(input.vendorId),
      serviceDescription: input.serviceDescription ?? null,
      quotedAmount: input.quotedAmount != null ? BigInt(input.quotedAmount) : null,
      agreedAmount: input.agreedAmount != null ? BigInt(input.agreedAmount) : null,
      depositRequired: input.depositRequired != null ? BigInt(input.depositRequired) : null,
      contractDate: input.contractDate ?? null,
      serviceDate: input.serviceDate ?? null,
      paymentDueDate: input.paymentDueDate ?? null,
      status: input.status,
      rating: input.rating ?? null,
      notes: input.notes ?? null,
    };
    const link = linkId
      ? await this.prisma.eventVendor.update({ where: { id: linkId }, data })
      : await this.prisma.eventVendor.upsert({
          where: { eventId_vendorId: { eventId, vendorId: BigInt(input.vendorId) } },
          create: data,
          update: data,
        });
    await this.audit.log({
      actorId: userId,
      workspaceId: event.workspaceId,
      eventId,
      action: linkId ? "event_vendor.update" : "event_vendor.assign",
      resourceType: "event_vendor",
      resourceId: link.id,
    });
    return link;
  }

  async removeEventVendor(userId: bigint, eventId: bigint, linkId: bigint) {
    await this.access.assertEventWrite(userId, eventId);
    await this.prisma.eventVendor.deleteMany({ where: { id: linkId, eventId } });
    return { ok: true };
  }
}
