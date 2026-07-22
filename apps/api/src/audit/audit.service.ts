import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  actorId?: bigint | number | null;
  workspaceId?: bigint | number | null;
  eventId?: bigint | number | null;
  action: string;
  resourceType: string;
  resourceId?: bigint | number | string | null;
  metadata?: Record<string, unknown>;
}

/** Append-only audit trail for security-relevant and financial actions. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: toData(entry) });
  }

  /**
   * Write the audit row INSIDE the caller's transaction. Financial mutations
   * must use this so a payment/expense change and its audit record commit or
   * roll back together — an unaudited financial write must never be possible.
   */
  async logTx(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: toData(entry) });
  }
}

function toData(entry: AuditEntry) {
  return {
    actorId: entry.actorId != null ? BigInt(entry.actorId) : null,
    workspaceId: entry.workspaceId != null ? BigInt(entry.workspaceId) : null,
    eventId: entry.eventId != null ? BigInt(entry.eventId) : null,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId != null ? String(entry.resourceId) : null,
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
  };
}
