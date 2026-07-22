import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { SchedulerService } from "./scheduler.service";
import { QueueModule } from "../../queue/queue.module";

@Global()
@Module({
  imports: [QueueModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, SchedulerService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
