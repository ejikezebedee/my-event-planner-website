import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { taskUpsertSchema } from "@mep/validation";
import { TasksService } from "./tasks.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("tasks")
@Controller({ path: "events/:eventId/tasks", version: "1" })
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("assigneeId") assigneeId?: string,
    @Query("overdue") overdue?: string,
  ) {
    return this.tasks.list(user.id, BigInt(eventId), {
      q,
      status,
      priority,
      assigneeId: assigneeId ? Number(assigneeId) : undefined,
      overdue: overdue === "true",
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(taskUpsertSchema)) body: never,
  ) {
    return this.tasks.create(user.id, BigInt(eventId), body);
  }

  @Patch(":taskId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("taskId", ParseIntPipe) taskId: number,
    @Body(new ZodValidationPipe(taskUpsertSchema)) body: never,
  ) {
    return this.tasks.update(user.id, BigInt(eventId), BigInt(taskId), body);
  }

  @HttpCode(200)
  @Delete(":taskId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("taskId", ParseIntPipe) taskId: number,
  ) {
    return this.tasks.remove(user.id, BigInt(eventId), BigInt(taskId));
  }
}
