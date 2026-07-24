import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Priority, TaskStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../audit/audit.service";

type TaskInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  assigneeId?: number | null;
  priority: Priority;
  startAt?: Date | null;
  dueAt?: Date | null;
  status: TaskStatus;
  notes?: string | null;
  dependencyIds: number[];
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Task list with search/filter and computed blocking info: a task is
   * blocked by every dependency that is not yet completed. Overdue is
   * derived from the due date and task state (open task, past due).
   */
  async list(
    userId: bigint,
    eventId: bigint,
    filter: {
      q?: string;
      status?: string;
      priority?: string;
      assigneeId?: number;
      overdue?: boolean;
    } = {},
  ) {
    await this.access.assertEventAccess(userId, eventId);
    const tasks = await this.prisma.task.findMany({
      where: { eventId },
      include: {
        dependencies: {
          select: { dependsOnTaskId: true, dependsOn: { select: { title: true, status: true } } },
        },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    });
    const now = new Date();
    const enriched = tasks.map((t) => {
      const blockedBy = t.dependencies
        .filter((d) => d.dependsOn.status !== "completed" && d.dependsOn.status !== "cancelled")
        .map((d) => ({ id: d.dependsOnTaskId, title: d.dependsOn.title }));
      const overdue =
        t.dueAt != null && t.dueAt < now && t.status !== "completed" && t.status !== "cancelled";
      return {
        ...t,
        dependencyIds: t.dependencies.map((d) => d.dependsOnTaskId),
        blockedBy,
        overdue,
        dependencies: undefined,
      };
    });
    return enriched.filter((t) => {
      if (filter.q) {
        const hay = `${t.title} ${t.description ?? ""} ${t.category ?? ""}`.toLowerCase();
        if (!hay.includes(filter.q.toLowerCase())) return false;
      }
      if (filter.status && t.status !== filter.status) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.assigneeId != null && t.assigneeId !== BigInt(filter.assigneeId)) return false;
      if (filter.overdue && !t.overdue) return false;
      return true;
    });
  }

  /** Detect whether making `taskId` depend on `dependsOnTaskId` would create a cycle. */
  private async wouldCycle(
    eventId: bigint,
    taskId: bigint,
    dependsOnTaskId: bigint,
  ): Promise<boolean> {
    if (taskId === dependsOnTaskId) return true;
    const deps = await this.prisma.taskDependency.findMany({
      where: { task: { eventId } },
      select: { taskId: true, dependsOnTaskId: true },
    });
    const graph = new Map<string, string[]>();
    for (const d of deps) {
      const key = d.taskId.toString();
      graph.set(key, [...(graph.get(key) ?? []), d.dependsOnTaskId.toString()]);
    }
    // Walk upstream from dependsOnTaskId; reaching taskId means a cycle.
    const stack = [dependsOnTaskId.toString()];
    const seen = new Set<string>();
    while (stack.length) {
      const current = stack.pop()!;
      if (current === taskId.toString()) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      for (const next of graph.get(current) ?? []) stack.push(next);
    }
    return false;
  }

  private async syncDependencies(eventId: bigint, taskId: bigint, dependencyIds: number[]) {
    const unique = [...new Set(dependencyIds.map((id) => BigInt(id)))];
    for (const depId of unique) {
      const depTask = await this.prisma.task.findFirst({ where: { id: depId, eventId } });
      if (!depTask)
        throw new BadRequestException(`Dependency task ${depId} not found in this event`);
      if (await this.wouldCycle(eventId, taskId, depId)) {
        throw new BadRequestException("This dependency would create a circular reference");
      }
    }
    await this.prisma.taskDependency.deleteMany({ where: { taskId } });
    if (unique.length > 0) {
      await this.prisma.taskDependency.createMany({
        data: unique.map((dependsOnTaskId) => ({ taskId, dependsOnTaskId })),
      });
    }
  }

  async create(userId: bigint, eventId: bigint, input: TaskInput) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const task = await this.prisma.task.create({
      data: {
        eventId,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        assigneeId: input.assigneeId != null ? BigInt(input.assigneeId) : null,
        priority: input.priority,
        startAt: input.startAt ?? null,
        dueAt: input.dueAt ?? null,
        status: input.status,
        notes: input.notes ?? null,
        completedAt: input.status === "completed" ? new Date() : null,
        completedById: input.status === "completed" ? userId : null,
        createdById: userId,
      },
    });
    await this.syncDependencies(eventId, task.id, input.dependencyIds);
    await this.audit.log({
      actorId: userId,
      workspaceId: event.workspaceId,
      eventId,
      action: "task.create",
      resourceType: "task",
      resourceId: task.id,
    });
    return task;
  }

  async update(userId: bigint, eventId: bigint, taskId: bigint, input: TaskInput) {
    const event = await this.access.assertEventWrite(userId, eventId);
    const existing = await this.prisma.task.findFirst({ where: { id: taskId, eventId } });
    if (!existing) throw new NotFoundException("Task not found");
    const becameCompleted = input.status === "completed" && existing.status !== "completed";
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        assigneeId: input.assigneeId != null ? BigInt(input.assigneeId) : null,
        priority: input.priority,
        startAt: input.startAt ?? null,
        dueAt: input.dueAt ?? null,
        status: input.status,
        notes: input.notes ?? null,
        completedAt: becameCompleted
          ? new Date()
          : input.status === "completed"
            ? existing.completedAt
            : null,
        completedById: becameCompleted
          ? userId
          : input.status === "completed"
            ? existing.completedById
            : null,
      },
    });
    await this.syncDependencies(eventId, taskId, input.dependencyIds);
    await this.audit.log({
      actorId: userId,
      workspaceId: event.workspaceId,
      eventId,
      action: "task.update",
      resourceType: "task",
      resourceId: taskId,
    });
    return { ok: true };
  }

  async remove(userId: bigint, eventId: bigint, taskId: bigint) {
    await this.access.assertEventWrite(userId, eventId);
    await this.prisma.task.deleteMany({ where: { id: taskId, eventId } });
    return { ok: true };
  }
}
