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
import { z } from "zod";
import { eventObjectSchema, eventUpsertSchema } from "@mep/validation";
import { EventsService } from "./events.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("events")
@Controller({ path: "events", version: "1" })
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("workspaceId", ParseIntPipe) workspaceId: number) {
    return this.events.listForWorkspace(user.id, BigInt(workspaceId));
  }

  @Get(":id")
  getOne(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.events.getOne(user.id, BigInt(id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(eventUpsertSchema)) body: never,
  ) {
    return this.events.create(user.id, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(eventObjectSchema.partial())) body: never,
  ) {
    return this.events.update(user.id, BigInt(id), body);
  }

  @HttpCode(200)
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.events.remove(user.id, BigInt(id));
  }

  @HttpCode(200)
  @Post(":id/restore")
  restore(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.events.restore(user.id, BigInt(id));
  }

  @Get(":id/members")
  listMembers(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.events.listMembers(user.id, BigInt(id));
  }

  @Post(":id/members")
  addMember(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body(
      new ZodValidationPipe(
        z.object({ userId: z.number().int().positive(), role: z.enum(["planner", "viewer"]) }),
      ),
    )
    body: { userId: number; role: "planner" | "viewer" },
  ) {
    return this.events.addMember(user.id, BigInt(id), BigInt(body.userId), body.role);
  }

  @HttpCode(200)
  @Delete(":id/members/:memberId")
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("memberId", ParseIntPipe) memberId: number,
  ) {
    return this.events.removeMember(user.id, BigInt(id), BigInt(memberId));
  }
}
