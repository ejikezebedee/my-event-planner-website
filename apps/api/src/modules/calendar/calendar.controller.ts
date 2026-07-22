import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { CalendarService } from "./calendar.service";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

@ApiTags("calendar")
@Controller({ version: "1" })
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get("events/:eventId/calendar")
  eventFeed(
    @CurrentUser() user: AuthUser,
    @Param("eventId", ParseIntPipe) eventId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.calendar.eventFeed(user.id, BigInt(eventId), from, to);
  }

  @Get("calendar")
  workspaceFeed(
    @CurrentUser() user: AuthUser,
    @Query("workspaceId", ParseIntPipe) workspaceId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.calendar.workspaceFeed(user.id, BigInt(workspaceId), from, to);
  }
}
