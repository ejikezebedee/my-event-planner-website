import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Event, WorkspaceRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Central authorization rules.
 *
 * - Workspace owner/admin: full access to every event in the workspace.
 * - Workspace planner/viewer: NO implicit event access — they must be an
 *   explicit EventMember (planner = read/write, viewer = read-only).
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getWorkspaceRole(userId: bigint, workspaceId: bigint): Promise<WorkspaceRole | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    return member?.role ?? null;
  }

  async assertWorkspaceRole(
    userId: bigint,
    workspaceId: bigint,
    allowed: WorkspaceRole[],
  ): Promise<WorkspaceRole> {
    const role = await this.getWorkspaceRole(userId, workspaceId);
    if (!role) throw new ForbiddenException("You are not a member of this workspace");
    if (!allowed.includes(role)) throw new ForbiddenException("Insufficient workspace permissions");
    return role;
  }

  /** Read access to an event. */
  async assertEventAccess(userId: bigint, eventId: bigint): Promise<Event> {
    return this.assertEvent(userId, eventId, false);
  }

  /** Write access to an event (planner-level or above). */
  async assertEventWrite(userId: bigint, eventId: bigint): Promise<Event> {
    return this.assertEvent(userId, eventId, true);
  }

  /**
   * Admin access to an event: workspace owner/admin or the event's own
   * creator. Event-level planners are deliberately NOT admins — destructive
   * actions (delete/archive/restore) and membership management stay with the
   * people accountable for the event.
   */
  async assertEventAdmin(userId: bigint, eventId: bigint): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException("Event not found");
    const wsRole = await this.getWorkspaceRole(userId, event.workspaceId);
    if (wsRole === "owner" || wsRole === "admin") return event;
    if (event.ownerId === userId) return event;
    const membership = await this.prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    // Deliberately 404 for non-members: don't reveal the event exists.
    if (!membership) throw new NotFoundException("Event not found");
    throw new ForbiddenException(
      "Only the event owner or a workspace admin can perform this action",
    );
  }

  private async assertEvent(userId: bigint, eventId: bigint, write: boolean): Promise<Event> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException("Event not found");

    const wsRole = await this.getWorkspaceRole(userId, event.workspaceId);
    if (wsRole === "owner" || wsRole === "admin") return event;

    const membership = await this.prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!membership) {
      // Deliberately 404 for non-members: don't reveal the event exists.
      throw new NotFoundException("Event not found");
    }
    if (write && membership.role !== "planner") {
      throw new ForbiddenException("You have read-only access to this event");
    }
    return event;
  }
}
