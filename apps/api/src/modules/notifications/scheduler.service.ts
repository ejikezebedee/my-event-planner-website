import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

const HOUR = 60 * 60 * 1000;

/**
 * In-process scheduler for scheduled notifications. Runs a first pass shortly
 * after boot and then hourly. No Redis dependency — generation is idempotent
 * via period-scoped dedupe keys, so overlapping passes are harmless.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger("Scheduler");
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;

  constructor(private readonly notifications: NotificationsService) {}

  onApplicationBootstrap() {
    if (process.env.SCHEDULER_ENABLED === "false") {
      this.logger.log("Scheduler disabled via SCHEDULER_ENABLED=false");
      return;
    }
    this.bootTimer = setTimeout(() => void this.pass("boot"), 15_000);
    this.timer = setInterval(() => void this.pass("hourly"), HOUR);
    this.logger.log("Scheduler started (boot pass in 15s, then hourly)");
  }

  private async pass(kind: string) {
    try {
      const created = await this.notifications.runScheduledPass();
      if (created > 0) this.logger.log(`${kind} pass created ${created} notification(s)`);
    } catch (err) {
      this.logger.warn(`${kind} pass failed: ${(err as Error).message}`);
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.bootTimer) clearTimeout(this.bootTimer);
  }
}
