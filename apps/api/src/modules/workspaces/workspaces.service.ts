import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueService } from "../../queue/queue.service";
import { AuditService } from "../../audit/audit.service";
import { AccessService } from "../../common/access/access.service";
import { generateToken, verifyPassword } from "../../common/utils/password";
import { hashToken } from "../auth/auth.service";
import { env } from "../../config/env";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  listForUser(userId: bigint) {
    return this.prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { where: { userId }, select: { role: true } },
        _count: { select: { events: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(userId: bigint, input: { name: string; currency?: string; timezone?: string }) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name: input.name,
        currency: input.currency ?? "EUR",
        timezone: input.timezone ?? "Europe/Berlin",
        ownerId: userId,
        members: { create: { userId, role: "owner" } },
      },
    });
    await this.audit.log({
      actorId: userId,
      workspaceId: workspace.id,
      action: "workspace.create",
      resourceType: "workspace",
      resourceId: workspace.id,
    });
    return workspace;
  }

  async update(
    userId: bigint,
    workspaceId: bigint,
    input: { name?: string; currency?: string; timezone?: string },
  ) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin"]);
    return this.prisma.workspace.update({ where: { id: workspaceId }, data: input });
  }

  async members(userId: bigint, workspaceId: bigint) {
    await this.access.assertWorkspaceRole(userId, workspaceId, [
      "owner",
      "admin",
      "planner",
      "viewer",
    ]);
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async invite(userId: bigint, workspaceId: bigint, email: string, role: WorkspaceRole) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin"]);
    const existing = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, user: { email } },
    });
    if (existing) throw new BadRequestException("This user is already a member of the workspace");

    const token = generateToken(32);
    const invitation = await this.prisma.workspaceInvitation.create({
      data: {
        workspaceId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const link = `${env.APP_BASE_URL}/invite?token=${token}`;
    await this.queue.enqueueEmail({
      to: email,
      subject: `You've been invited to "${workspace.name}"`,
      text: `You were invited to join the workspace "${workspace.name}" as ${role}.\n\nAccept the invitation (valid 7 days):\n${link}`,
    });
    await this.audit.log({
      actorId: userId,
      workspaceId,
      action: "workspace.invite",
      resourceType: "workspace_invitation",
      resourceId: invitation.id,
      metadata: { email, role },
    });
    return { ok: true };
  }

  async acceptInvitation(userId: bigint, userEmail: string, token: string) {
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new BadRequestException("This invitation is invalid or has expired");
    }
    if (invitation.email !== userEmail) {
      throw new ForbiddenException("This invitation was sent to a different email address");
    }
    await this.prisma.$transaction([
      this.prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
        create: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
        update: { role: invitation.role },
      }),
      this.prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);
    return { workspaceId: invitation.workspaceId };
  }

  async updateMemberRole(
    userId: bigint,
    workspaceId: bigint,
    memberId: bigint,
    role: WorkspaceRole,
  ) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner"]);
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.workspaceId !== workspaceId)
      throw new NotFoundException("Member not found");
    if (member.role === "owner")
      throw new BadRequestException("The workspace owner's role cannot be changed");
    return this.prisma.workspaceMember.update({ where: { id: memberId }, data: { role } });
  }

  /**
   * Ownership transfer (C12): owner-only, confirmed with the owner's
   * password. The new owner becomes role=owner; the previous owner stays as
   * admin. Everything commits in one transaction and is audited.
   */
  async transferOwnership(userId: bigint, workspaceId: bigint, memberId: bigint, password: string) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner"]);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Password is incorrect");

    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member || member.workspaceId !== workspaceId)
      throw new NotFoundException("Member not found");
    if (member.userId === userId) throw new BadRequestException("You already own this workspace");
    if (!member.user.emailVerifiedAt)
      throw new BadRequestException("The new owner must have a verified email address");

    await this.prisma.$transaction(async (tx) => {
      const ownershipUpdate = await tx.workspace.updateMany({
        where: { id: workspaceId, ownerId: userId },
        data: { ownerId: member.userId },
      });
      if (ownershipUpdate.count !== 1)
        throw new ConflictException("Workspace ownership changed; reload and try again");
      await tx.workspaceMember.updateMany({
        where: { workspaceId, role: "owner" },
        data: { role: "admin" },
      });
      await tx.workspaceMember.update({ where: { id: member.id }, data: { role: "owner" } });
      await this.audit.logTx(tx, {
        actorId: userId,
        workspaceId,
        action: "workspace.transfer_ownership",
        resourceType: "workspace",
        resourceId: workspaceId,
        metadata: { newOwnerId: String(member.userId), newOwnerEmail: member.user.email },
      });
    });

    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await this.queue.enqueueEmail({
      to: member.user.email,
      subject: `You now own "${workspace.name}"`,
      text: `Ownership of the workspace "${workspace.name}" was transferred to you by ${user.email}.`,
    });
    return { ok: true };
  }

  async removeMember(userId: bigint, workspaceId: bigint, memberId: bigint) {
    await this.access.assertWorkspaceRole(userId, workspaceId, ["owner", "admin"]);
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.workspaceId !== workspaceId)
      throw new NotFoundException("Member not found");
    if (member.role === "owner")
      throw new BadRequestException("The workspace owner cannot be removed");
    if (member.userId === userId) throw new BadRequestException("You cannot remove yourself");
    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
    await this.audit.log({
      actorId: userId,
      workspaceId,
      action: "workspace.remove_member",
      resourceType: "workspace_member",
      resourceId: memberId,
    });
    return { ok: true };
  }
}
