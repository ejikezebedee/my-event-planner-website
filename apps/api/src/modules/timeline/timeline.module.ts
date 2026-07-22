import { Module } from "@nestjs/common";
import { TimelineController } from "./timeline.controller";
import { TimelineService } from "./timeline.service";
import { CalendarModule } from "../calendar/calendar.module";

@Module({
  imports: [CalendarModule],
  controllers: [TimelineController],
  providers: [TimelineService],
})
export class TimelineModule {}
