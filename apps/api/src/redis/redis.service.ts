import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { env } from "../config/env";

/**
 * Optional Redis connection. When REDIS_URL is empty or the connection
 * fails, the app keeps running with queues disabled (graceful degradation).
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger("Redis");
  private client: Redis | null = null;
  private available = false;
  private connectPromise: Promise<void> | null = null;

  async connect(): Promise<void> {
    if (this.isAvailable) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.connectInternal().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private async connectInternal(): Promise<void> {
    if (!env.REDIS_URL) {
      if (env.NODE_ENV === "production") throw new Error("REDIS_URL is required in production");
      this.logger.log("REDIS_URL not set — background queues disabled");
      return;
    }
    try {
      this.client ??= new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        retryStrategy: (times) => Math.min(times * 500, 5000),
      });
      if (this.client.status === "wait") await this.client.connect();
      await this.client.ping();
      this.available = true;
      this.logger.log("Redis connected");
    } catch (err) {
      this.available = false;
      const message = (err as Error).message;
      if (env.NODE_ENV === "production") throw new Error(`Redis connection failed: ${message}`);
      this.logger.warn(`Redis unavailable, queues disabled: ${message}`);
    }
  }

  get isAvailable(): boolean {
    return this.available && this.client !== null;
  }

  get connection(): Redis | null {
    return this.available ? this.client : null;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.client) await this.client.quit().catch(() => undefined);
  }
}
