import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../../redis/redis.service";
import { StorageService } from "../../storage/storage.service";
import { Public } from "../../common/decorators/public.decorator";

@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness: process is up. */
  @Public()
  @Get()
  live() {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  /** Readiness: database reachable; redis/storage reported but optional. */
  @Public()
  @Get("ready")
  async ready() {
    let database = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }
    const [redisOk, storageOk] = await Promise.all([
      this.redis.ping().catch(() => false),
      this.storage.healthCheck().catch(() => false),
    ]);
    if (!database) throw new ServiceUnavailableException({ status: "error", database });
    return {
      status: "ok",
      database,
      redis: this.redis.isAvailable ? redisOk : "disabled",
      storage: { driver: this.storage.driver, ok: storageOk },
    };
  }
}
