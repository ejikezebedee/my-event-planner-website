import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { extname } from "path";
import { ALLOWED_UPLOAD_EXTENSIONS, BLOCKED_UPLOAD_EXTENSIONS } from "@mep/config";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";
import { ScannerService } from "./scanner.service";
import { env } from "../../config/env";

/**
 * Magic-byte sniffing for the binary formats we accept. Text formats
 * (csv/txt) carry no reliable signature and are served as attachments,
 * so they are exempt. Returns true when the content plausibly matches
 * the claimed extension — blocks renamed executables and HTML/JS
 * masquerading as images or PDFs.
 */
function contentMatchesExtension(ext: string, buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const head = buffer.subarray(0, 1024);
  switch (ext) {
    case "pdf":
      // The %PDF- header may appear within the first 1024 bytes.
      return head.includes("%PDF-", "latin1");
    case "png":
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 && // P
        buffer[2] === 0x4e && // N
        buffer[3] === 0x47 && // G
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    case "jpg":
    case "jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "gif":
      return head.subarray(0, 4).toString("latin1") === "GIF8";
    case "webp":
      return (
        buffer.length >= 12 &&
        head.subarray(0, 4).toString("latin1") === "RIFF" &&
        head.subarray(8, 12).toString("latin1") === "WEBP"
      );
    case "doc":
    case "xls":
      // OLE2 compound document signature.
      return (
        buffer.length >= 8 &&
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0 &&
        buffer[4] === 0xa1 &&
        buffer[5] === 0xb1 &&
        buffer[6] === 0x1a &&
        buffer[7] === 0xe1
      );
    case "docx":
    case "xlsx":
      // ZIP container signature.
      return (
        buffer.length >= 4 &&
        buffer[0] === 0x50 && // P
        buffer[1] === 0x4b && // K
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
        (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
      );
    default:
      // csv, txt and any future text formats: no signature to check.
      return true;
  }
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly scanner: ScannerService,
  ) {}

  private validateFile(file: { originalname: string; size: number; mimetype: string; buffer: Buffer }) {
    const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${env.MAX_UPLOAD_MB} MB limit`);
    }
    const ext = extname(file.originalname).toLowerCase().replace(/^\./, "");
    if ((BLOCKED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestException(`Files of type .${ext} are not allowed`);
    }
    if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestException(`Unsupported file type .${ext}`);
    }
    if (!contentMatchesExtension(ext, file.buffer)) {
      throw new BadRequestException("File content does not match its extension");
    }
  }

  async list(userId: bigint, eventId: bigint, filter: { expenseId?: number; paymentId?: number } = {}) {
    await this.access.assertEventAccess(userId, eventId);
    return this.prisma.document.findMany({
      where: {
        eventId,
        expenseId: filter.expenseId != null ? BigInt(filter.expenseId) : undefined,
        paymentId: filter.paymentId != null ? BigInt(filter.paymentId) : undefined,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(
    userId: bigint,
    eventId: bigint,
    file: { originalname: string; size: number; mimetype: string; buffer: Buffer },
    meta: {
      category?: string;
      description?: string;
      expenseId?: number;
      paymentId?: number;
      linkedType?: string;
      linkedId?: number;
    },
  ) {
    const event = await this.access.assertEventWrite(userId, eventId);
    this.validateFile(file);

    // Receipts and proofs of payment must reference records of the same event.
    if (meta.expenseId != null) {
      const expense = await this.prisma.expense.findFirst({
        where: { id: BigInt(meta.expenseId), eventId },
      });
      if (!expense) throw new BadRequestException("Expense not found in this event");
    }
    if (meta.paymentId != null) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: BigInt(meta.paymentId), eventId },
      });
      if (!payment) throw new BadRequestException("Payment not found in this event");
    }
    // Vendor and task links use the generic linkedType/linkedId pair.
    if (meta.linkedType === "vendor" && meta.linkedId != null) {
      const link = await this.prisma.eventVendor.findFirst({
        where: { eventId, vendorId: BigInt(meta.linkedId) },
      });
      if (!link) throw new BadRequestException("Vendor is not linked to this event");
    } else if (meta.linkedType === "task" && meta.linkedId != null) {
      const task = await this.prisma.task.findFirst({
        where: { id: BigInt(meta.linkedId), eventId },
      });
      if (!task) throw new BadRequestException("Task not found in this event");
    } else if (meta.linkedType != null || meta.linkedId != null) {
      throw new BadRequestException("Unsupported document link (allowed: vendor, task)");
    }

    const storageKey = this.storage.newStorageKey(file.originalname);
    await this.storage.put(storageKey, file.buffer, file.mimetype);

    // Malware scan (H2): every upload passes the scanner abstraction.
    // Infected files are removed from storage immediately and rejected.
    let scanStatus: "clean" | "infected" | "error";
    try {
      scanStatus = await this.scanner.scan(file.buffer, file.originalname);
    } catch {
      scanStatus = "error"; // engine unreachable — file stays quarantined from downloads
    }
    if (scanStatus === "infected") {
      await this.storage.remove(storageKey).catch(() => undefined);
      await this.audit.log({
        actorId: userId,
        workspaceId: event.workspaceId,
        eventId,
        action: "document.quarantined",
        resourceType: "document",
        metadata: { name: file.originalname, engine: this.scanner.engine },
      });
      throw new BadRequestException("The uploaded file was identified as malware and was rejected");
    }

    const document = await this.prisma.document.create({
      data: {
        workspaceId: event.workspaceId,
        eventId,
        expenseId: meta.expenseId != null ? BigInt(meta.expenseId) : null,
        paymentId: meta.paymentId != null ? BigInt(meta.paymentId) : null,
        linkedType: meta.linkedType ?? null,
        linkedId: meta.linkedId != null ? BigInt(meta.linkedId) : null,
        category: meta.category ?? "other",
        originalName: file.originalname.slice(0, 512),
        storageKey,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        description: meta.description ?? null,
        scanStatus,
        scannedAt: new Date(),
        uploadedById: userId,
      },
    });
    await this.audit.log({
      actorId: userId,
      workspaceId: event.workspaceId,
      eventId,
      action: "document.upload",
      resourceType: "document",
      resourceId: document.id,
      metadata: {
        name: file.originalname,
        size: file.size,
        expenseId: meta.expenseId ?? null,
        paymentId: meta.paymentId ?? null,
      },
    });
    return document;
  }

  /** Returns either a presigned URL (s3) or the raw stream data (local). */
  async getDownload(userId: bigint, documentId: bigint) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || !document.eventId) throw new NotFoundException("Document not found");
    await this.access.assertEventAccess(userId, document.eventId);

    // Quarantine enforcement: infected or unscannable files are never served.
    if (document.scanStatus === "infected") {
      throw new GoneException("This file was quarantined by malware scanning");
    }
    if (document.scanStatus === "error") {
      throw new ServiceUnavailableException(
        "This file could not be malware-scanned and is temporarily unavailable",
      );
    }

    if (this.storage.driver === "s3") {
      const url = await this.storage.getSignedDownloadUrl(document.storageKey, document.originalName);
      if (url) return { kind: "redirect" as const, url, document };
    }
    const buffer = await this.storage.getBuffer(document.storageKey);
    return { kind: "buffer" as const, buffer, document };
  }

  async remove(userId: bigint, documentId: bigint) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || !document.eventId) throw new NotFoundException("Document not found");
    const event = await this.access.assertEventWrite(userId, document.eventId);
    await this.prisma.document.delete({ where: { id: documentId } });
    await this.storage.remove(document.storageKey);
    await this.audit.log({
      actorId: userId,
      workspaceId: event.workspaceId,
      eventId: document.eventId,
      action: "document.delete",
      resourceType: "document",
      resourceId: documentId,
    });
    return { ok: true };
  }
}
