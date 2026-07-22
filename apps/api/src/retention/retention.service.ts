import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const DAY = 24 * 60 * 60 * 1000;

/** Retention windows (data minimisation). Audit logs are intentionally kept. */
export const RETENTION = {
  sessionGraceMs: 7 * DAY, // revoked/expired sessions are purged after 7 days
  tokenGraceMs: DAY, // used/expired one-time tokens after 24 h
  invitationGraceMs: 7 * DAY, // accepted/expired invitations after 7 days
  readNotificationMs: 90 * DAY, // read notifications after 90 days
  contactSubmissionMs: 365 * DAY, // contact-form PII after 12 months
} as const;

/**
 * Data-retention cleanup (H3). Runs a first pass shortly after boot and then
 * daily, in-process, alongside the notification scheduler. All deletions are
 * idempotent deleteMany operations, so overlapping passes across instances
 * are harmless. Audit logs are never touched — they are the compliance trail.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Retention");
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (process.env.SCHEDULER_ENABLED === "false") {
      this.logger.log("Retention disabled via SCHEDULER_ENABLED=false");
      return;
    }
    this.bootTimer = setTimeout(() => void this.run("boot"), 60_000);
    this.timer = setInterval(() => void this.run("daily"), DAY);
    this.logger.log("Retention cleanup started (boot pass in 60s, then daily)");
  }

  async run(kind: string = "manual"): Promise<void> {
    try {
      const summary = await this.cleanup();
      const total = Object.values(summary).reduce((s, n) => s + n, 0);
      if (total > 0) this.logger.log(`${kind} retention pass purged: ${JSON.stringify(summary)}`);
    } catch (err) {
      this.logger.warn(`${kind} retention pass failed: ${(err as Error).message}`);
    }
  }

  /** One cleanup pass. Returns per-collection purge counts. */
  async cleanup() {
    const now = Date.now();
    const [sessions, passwordTokens, verifyTokens, emailChangeTokens, invitations, notifications, contacts] =
      await this.prisma.$transaction([
        // Sessions that are revoked or expired, past the grace window.
        this.prisma.session.deleteMany({
          where: {
            OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: new Date(now) } }],
            createdAt: { lte: new Date(now - RETENTION.sessionGraceMs) },
          },
        }),
        this.prisma.passwordResetToken.deleteMany({
          where: {
            OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date(now) } }],
            createdAt: { lte: new Date(now - RETENTION.tokenGraceMs) },
          },
        }),
        this.prisma.emailVerificationToken.deleteMany({
          where: {
            OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date(now) } }],
            createdAt: { lte: new Date(now - RETENTION.tokenGraceMs) },
          },
        }),
        this.prisma.emailChangeToken.deleteMany({
          where: {
            OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date(now) } }],
            createdAt: { lte: new Date(now - RETENTION.tokenGraceMs) },
          },
        }),
        this.prisma.workspaceInvitation.deleteMany({
          where: {
            OR: [{ acceptedAt: { not: null } }, { expiresAt: { lte: new Date(now) } }],
            createdAt: { lte: new Date(now - RETENTION.invitationGraceMs) },
          },
        }),
        this.prisma.notification.deleteMany({
          where: { readAt: { not: null }, createdAt: { lte: new Date(now - RETENTION.readNotificationMs) } },
        }),
        this.prisma.contactSubmission.deleteMany({
          where: { createdAt: { lte: new Date(now - RETENTION.contactSubmissionMs) } },
        }),
      ]);
    return {
      sessions: sessions.count,
      passwordResetTokens: passwordTokens.count,
      emailVerificationTokens: verifyTokens.count,
      emailChangeTokens: emailChangeTokens.count,
      workspaceInvitations: invitations.count,
      readNotifications: notifications.count,
      contactSubmissions: contacts.count,
    };
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }
}
