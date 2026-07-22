import { Module } from "@nestjs/common";
import { MailerModule } from "../mailer/mailer.module";
import { RedisModule } from "../redis/redis.module";
import { EmailWorker } from "./email.worker";

/** Standalone module for the email worker process (src/worker.ts). */
@Module({
  imports: [RedisModule, MailerModule],
  providers: [EmailWorker],
})
export class WorkerModule {}
