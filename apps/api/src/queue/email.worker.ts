import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import { MailerService, type MailMessage } from "../mailer/mailer.service";
import { RedisService } from "../redis/redis.service";

/**
 * Dedicated email worker. Consumes the "email" BullMQ queue in its own
 * process (see src/worker.ts) so mail delivery never shares a failure domain
 * with the HTTP API. Jobs are persisted in Redis and retried with
 * exponential backoff (configured at enqueue time); a delivery failure
 * throws so BullMQ retries, and permanently failed jobs land in the queue's
 * failed set where they are logged and can be inspected/requeued.
 */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("EmailWorker");
  private worker: Worker<MailMessage> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
  ) {}

  async onModuleInit() {
    await this.redis.connect();
    if (!this.redis.isAvailable || !this.redis.connection) {
      throw new Error(
        "Email worker requires a working REDIS_URL — without Redis the API serves mail inline instead.",
      );
    }
    this.worker = new Worker<MailMessage>(
      "email",
      async (job) => {
        const result = await this.mailer.send(job.data);
        if (!result.delivered) {
          // Throwing re-queues the job per its attempts/backoff policy.
          throw new Error(`Mail delivery failed via ${result.provider}`);
        }
      },
      { connection: this.redis.connection, concurrency: 5 },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(
        `Email job ${job?.id ?? "?"} to=${job?.data?.to ?? "?"} failed on attempt ${job?.attemptsMade ?? "?"}: ${err.message}`,
      );
    });
    this.logger.log("Email worker is consuming queue 'email'");
  }

  async onModuleDestroy() {
    if (this.worker) await this.worker.close();
  }
}
