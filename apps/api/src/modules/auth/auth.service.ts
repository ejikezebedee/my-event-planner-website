import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash } from "crypto";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "./auth.types";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../../mailer/mailer.service";
import { QueueService } from "../../queue/queue.service";
import { AuditService } from "../../audit/audit.service";
import { generateToken, hashPassword, verifyPassword } from "../../common/utils/password";
import { env } from "../../config/env";
import { StorageService } from "../../storage/storage.service";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private sessionExpiry(): Date {
    return new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  }

  async createSession(userId: bigint, meta?: { userAgent?: string; ip?: string }) {
    const token = generateToken(32);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        userAgent: meta?.userAgent?.slice(0, 512) ?? null,
        ip: meta?.ip ?? null,
        expiresAt: this.sessionExpiry(),
      },
    });
    return { token, expiresAt: this.sessionExpiry() };
  }

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("An account with this email already exists");

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        timezone: input.timezone ?? "Europe/Berlin",
        currency: input.currency ?? "EUR",
      },
    });

    // Every account gets a personal workspace owned by the user.
    const workspace = await this.prisma.workspace.create({
      data: {
        name: `${input.name}'s Workspace`,
        currency: user.currency,
        timezone: user.timezone,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "owner" } },
      },
    });

    await this.sendVerificationEmail(user.id, user.email);
    await this.audit.log({
      actorId: user.id,
      workspaceId: workspace.id,
      action: "auth.register",
      resourceType: "user",
      resourceId: user.id,
    });
    return user;
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Uniform error — never reveal whether the account exists.
    if (!user) throw new UnauthorizedException("Invalid email or password");
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password");
    return user;
  }

  async logout(token: string | undefined) {
    if (!token) return;
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { passwordHash: _omit, ...profile } = user;
    return profile;
  }

  async updateProfile(userId: bigint, input: UpdateProfileInput) {
    const user = await this.prisma.user.update({ where: { id: userId }, data: input });
    const { passwordHash: _omit, ...profile } = user;
    return profile;
  }

  async changePassword(userId: bigint, input: ChangePasswordInput) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Current password is incorrect");
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Revoke all other sessions; the caller's session is re-issued by the controller.
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({ actorId: userId, action: "auth.change_password", resourceType: "user", resourceId: userId });
  }

  /** Always succeeds from the caller's perspective (generic response). */
  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const token = generateToken(32);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const link = `${env.APP_BASE_URL}/reset-password?token=${token}`;
    await this.queue.enqueueEmail({
      to: user.email,
      subject: "Reset your My Event Planner password",
      text: `A password reset was requested for your account. Open this link within 1 hour:\n\n${link}\n\nIf you did not request this, ignore this email.`,
    });
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException("This reset link is invalid or has expired");
    }
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({ actorId: record.userId, action: "auth.reset_password", resourceType: "user", resourceId: record.userId });
  }

  async sendVerificationEmail(userId: bigint, email: string) {
    const token = generateToken(32);
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    });
    const link = `${env.APP_BASE_URL}/verify-email?token=${token}`;
    await this.queue.enqueueEmail({
      to: email,
      subject: "Verify your My Event Planner email",
      text: `Welcome! Confirm your email address within 24 hours:\n\n${link}`,
    });
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException("This verification link is invalid or has expired");
    }
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
  }

  /**
   * Email change (H1): password-confirmed request, then the NEW address must
   * be verified via a token link before it replaces the old one. The old
   * address gets a security notice. Until confirmed, nothing changes.
   */
  async requestEmailChange(userId: bigint, input: { newEmail: string; password: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Password is incorrect");
    if (input.newEmail === user.email) {
      throw new BadRequestException("This is already the email address on your account");
    }
    const taken = await this.prisma.user.findUnique({ where: { email: input.newEmail } });
    if (taken) throw new ConflictException("An account with this email already exists");

    // Only one pending change at a time — earlier requests are voided.
    await this.prisma.emailChangeToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = generateToken(32);
    await this.prisma.emailChangeToken.create({
      data: {
        userId,
        newEmail: input.newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    const link = `${env.APP_BASE_URL}/confirm-email-change?token=${token}`;
    await this.queue.enqueueEmail({
      to: input.newEmail,
      subject: "Confirm your new email address",
      text: `You asked to change the email address of your My Event Planner account to this address. Confirm within 24 hours:\n\n${link}\n\nIf you did not request this, ignore this email — your address stays unchanged.`,
    });
    await this.queue.enqueueEmail({
      to: user.email,
      subject: "Security notice: email change requested",
      text: `A change of your account's email address to ${input.newEmail} was requested. If this was not you, change your password immediately and contact support.`,
    });
    await this.audit.log({
      actorId: userId,
      action: "auth.change_email_requested",
      resourceType: "user",
      resourceId: userId,
      metadata: { newEmail: input.newEmail },
    });
  }

  /** Completes the email change. Public: the emailed token is the proof. */
  async confirmEmailChange(token: string) {
    const record = await this.prisma.emailChangeToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new UnauthorizedException("This confirmation link is invalid or has expired");
    }
    // Re-check uniqueness at confirm time — the address may have been taken meanwhile.
    const taken = await this.prisma.user.findUnique({ where: { email: record.newEmail } });
    if (taken) throw new ConflictException("An account with this email already exists");
    await this.prisma.$transaction(async (tx) => {
      await tx.emailChangeToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await tx.user.update({
        where: { id: record.userId },
        // The new address was just verified by the token — mark it verified.
        data: { email: record.newEmail, emailVerifiedAt: new Date() },
      });
      // All existing sessions are revoked: sign in again with the new address.
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.logTx(tx, {
        actorId: record.userId,
        action: "auth.change_email",
        resourceType: "user",
        resourceId: record.userId,
        metadata: { newEmail: record.newEmail },
      });
    });
  }

  async exportAccountData(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        currency: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true, role: true, createdAt: true },
    });
    const workspaceIds = memberships.map((membership) => membership.workspaceId);
    const events = await this.prisma.event.findMany({ where: { workspaceId: { in: workspaceIds } } });
    const eventIds = events.map((event) => event.id);
    const [workspaces, budgetCategories, budgetItems, expenses, payments, vendors, guests, tasks, notifications, documents, auditLogs] = await Promise.all([
      this.prisma.workspace.findMany({ where: { id: { in: workspaceIds } } }),
      this.prisma.budgetCategory.findMany({ where: { eventId: { in: eventIds } } }),
      this.prisma.budgetItem.findMany({ where: { eventId: { in: eventIds } } }),
      this.prisma.expense.findMany({ where: { eventId: { in: eventIds } } }),
      this.prisma.payment.findMany({ where: { eventId: { in: eventIds } } }),
      this.prisma.vendor.findMany({ where: { workspaceId: { in: workspaceIds } } }),
      this.prisma.guest.findMany({ where: { eventId: { in: eventIds } } }),
      this.prisma.task.findMany({ where: { eventId: { in: eventIds } } }),
      this.prisma.notification.findMany({ where: { userId } }),
      this.prisma.document.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true, eventId: true, category: true, originalName: true, mimeType: true, sizeBytes: true, description: true, scanStatus: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({ where: { OR: [{ actorId: userId }, { workspaceId: { in: workspaceIds } }] } }),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      user,
      memberships,
      workspaces,
      events,
      budgetCategories,
      budgetItems,
      expenses,
      payments,
      vendors,
      guests,
      tasks,
      notifications,
      documents,
      auditLogs,
    };
  }

  /**
   * Safe account deletion (C11). Requires the password and a typed
   * confirmation. Sole-member owned workspaces (and all their events,
   * expenses, payments, documents) are deleted with the account via cascade.
   * Workspaces shared with other members must be transferred or vacated
   * first — we never silently delete other people's data.
   */
  async deleteAccount(userId: bigint, input: { password: string; confirmation: "DELETE" }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Password is incorrect");

    const owned = await this.prisma.workspace.findMany({
      where: { ownerId: userId },
      include: { members: { select: { userId: true } } },
    });
    const shared = owned.filter((w) => w.members.some((m) => m.userId !== userId));
    if (shared.length > 0) {
      throw new ConflictException(
        `You still own shared workspace(s): ${shared.map((w) => w.name).join(", ")}. Transfer ownership or remove all other members before deleting your account.`,
      );
    }

    const ownedWorkspaceIds = owned.map((workspace) => workspace.id);
    const storedDocuments = await this.prisma.document.findMany({
      where: { workspaceId: { in: ownedWorkspaceIds } },
      select: { storageKey: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // Sole-member owned workspaces go with the account (full cascade).
      await tx.workspace.deleteMany({ where: { ownerId: userId } });
      // Memberships in other people's workspaces end here.
      await tx.workspaceMember.deleteMany({ where: { userId } });
      // Sessions, notifications and event memberships cascade with the user.
      await tx.user.delete({ where: { id: userId } });
      // Tombstone: actorId/userId are plain columns, the trail stays intact.
      await this.audit.logTx(tx, {
        actorId: userId,
        action: "auth.delete_account",
        resourceType: "user",
        resourceId: userId,
        metadata: { deletedUserId: userId.toString() },
      });
    });

    await Promise.allSettled(storedDocuments.map((document) => this.storage.remove(document.storageKey)));
  }

  async listSessions(userId: bigint) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ip: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeSession(userId: bigint, sessionId: bigint) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
