import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { NOTIFICATION_TYPES } from "@mep/types";
import { NotificationsService } from "./notifications.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

const prefsSchema = z.object({
  types: z.record(z.enum(NOTIFICATION_TYPES), z.boolean()).default({}),
  email: z.boolean().default(false),
});

@ApiTags("notifications")
@Controller({ path: "notifications", version: "1" })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.list(user.id);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id).then((count) => ({ count }));
  }

  @Get("preferences")
  getPrefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPrefs(user.id);
  }

  @Put("preferences")
  updatePrefs(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(prefsSchema)) body: z.infer<typeof prefsSchema>,
  ) {
    return this.notifications.updatePrefs(user.id, body);
  }

  @HttpCode(200)
  @Post(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.notifications.markRead(user.id, BigInt(id));
  }

  @HttpCode(200)
  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @HttpCode(200)
  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.notifications.remove(user.id, BigInt(id));
  }

  /** Manual trigger — the same generator the scheduler runs hourly. */
  @HttpCode(200)
  @Post("generate")
  generate(@CurrentUser() user: AuthUser) {
    return this.notifications.runScheduledPass().then((created) => ({ created }));
  }
}
