import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./queue/worker.module";
import { assertProductionConfig, env } from "./config/env";

/**
 * Dedicated email worker process (outbox consumer). The API enqueues mail
 * jobs into Redis; this process delivers them with retries and backoff, so a
 * mail-provider outage never blocks or loses HTTP requests. Run alongside
 * the API in production: `node dist/worker.js`.
 */
async function bootstrap() {
  assertProductionConfig();
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["log", "warn", "error"],
  });
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log(`Email worker started (provider: ${env.EMAIL_PROVIDER})`);
}

void bootstrap();
