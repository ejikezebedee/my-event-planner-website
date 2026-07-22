import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { guestImportSchema, guestUpsertSchema } from "@mep/validation";
import { GuestsService } from "./guests.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";

@ApiTags("guests")
@Controller({ path: "events/:eventId/guests", version: "1" })
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Query("q") q?: string,
    @Query("rsvpStatus") rsvpStatus?: string,
    @Query("invitationStatus") invitationStatus?: string,
    @Query("groupId") groupId?: string,
  ) {
    return this.guests.list(user.id, BigInt(eventId), {
      q,
      rsvpStatus,
      invitationStatus,
      groupId: groupId ? Number(groupId) : undefined,
    });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(guestUpsertSchema)) body: never,
  ) {
    return this.guests.create(user.id, BigInt(eventId), body);
  }

  @Patch(":guestId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("guestId", ParseIntPipe) guestId: number,
    @Body(new ZodValidationPipe(guestUpsertSchema)) body: never,
  ) {
    return this.guests.update(user.id, BigInt(eventId), BigInt(guestId), body);
  }

  @HttpCode(200)
  @Delete(":guestId")
  remove(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Param("guestId", ParseIntPipe) guestId: number,
  ) {
    return this.guests.remove(user.id, BigInt(eventId), BigInt(guestId));
  }

  @Post("groups")
  createGroup(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(z.object({ name: z.string().trim().min(1).max(128) })))
    body: { name: string },
  ) {
    return this.guests.createGroup(user.id, BigInt(eventId), body.name);
  }

  @HttpCode(200)
  @Post("import")
  importCsv(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Body(new ZodValidationPipe(guestImportSchema)) body: { csv: string; dryRun?: boolean },
  ) {
    return this.guests.importCsv(user.id, BigInt(eventId), body.csv, body.dryRun === true);
  }

  @Get("import/template")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="guest-import-template.csv"')
  importTemplate(@CurrentUser() user: AuthUser, @Param("eventId", ParseIntPipe) eventId: number) {
    return this.guests.importTemplate(user.id, BigInt(eventId));
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="guests.csv"')
  exportCsv(@CurrentUser() user: AuthUser, @Param("eventId", ParseIntPipe) eventId: number) {
    return this.guests.exportCsv(user.id, BigInt(eventId));
  }
}
