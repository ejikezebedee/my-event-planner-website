import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { MailerService, type MailMessage } from "../mailer/mailer.service";
import { RedisService } from "../redis/redis.service";

/**
 * Background jobs via BullMQ when Redis is available; otherwise jobs run
 * inline so the app never hard-depends on Redis (graceful degradation).
 *
 * When Redis IS configured, enqueued mail is consumed by the dedicated
 * worker process (src/worker.ts — `node dist/worker.js`), which must run
 * alongside the API in production. Jobs persist in Redis until delivered
 * (outbox semantics: retries with exponential backoff, failed set on
 * exhaustion).
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger("Queue");
  private emailQueue: Queue | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
  ) {}

  private getQueue(): Queue | null {
    if (!this.redis.isAvailable) return null;
    if (!this.emailQueue) {
      this.emailQueue = new Queue("email", {
        connection: this.redis.connection!,
        defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
      });
    }
    return this.emailQueue;
  }

  async enqueueEmail(message: MailMessage): Promise<void> {
    const queue = this.getQueue();
    if (queue) {
      await queue.add("send", message);
      return;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email queue unavailable in production");
    }
    await this.mailer.send(message).catch((err) => {
      this.logger.warn(`Inline mail failed: ${err.message}`);
      throw err;
    });
  }

  async onModuleDestroy() {
    if (this.emailQueue) await this.emailQueue.close().catch(() => undefined);
  }
}
