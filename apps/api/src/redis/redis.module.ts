import { Global, Module, OnModuleInit } from "@nestjs/common";
import { RedisService } from "./redis.service";

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule implements OnModuleInit {
  constructor(private readonly redis: RedisService) {}
  async onModuleInit() { await this.redis.connect(); }
}
