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
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { timelineEntrySchema } from "@mep/validation";
import { TimelineService } from "./timeline.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("timeline")
@Controller({ path: "events/:eventId/timeline", version: "1" })
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("eventId", ParseIntPipe) eventId: number) {
    return this.timeline.list(user.id, BigInt(eventId));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(timelineEntrySchema)) body: never,
  ) {
    return this.timeline.create(user.id, BigInt(eventId), body);
  }

  @Patch(":entryId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("entryId", ParseIntPipe) entryId: number,
    @Body(new ZodValidationPipe(timelineEntrySchema)) body: never,
  ) {
    return this.timeline.update(user.id, BigInt(eventId), BigInt(entryId), body);
  }

  @HttpCode(200)
  @Delete(":entryId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("entryId", ParseIntPipe) entryId: number,
  ) {
    return this.timeline.remove(user.id, BigInt(eventId), BigInt(entryId));
  }
}
