import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { assertProductionConfig, env } from "./config/env";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { BigIntInterceptor } from "./common/interceptors/bigint.interceptor";

async function bootstrap() {
  // Fail fast on unsafe production configuration before opening any socket.
  assertProductionConfig();
  const app = await NestFactory.create(AppModule);

  if (env.TRUST_PROXY) app.getHttpAdapter().getInstance().set("trust proxy", env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  const corsOrigins = env.WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new BigIntInterceptor());
  app.enableShutdownHooks();

  if (env.SWAGGER_ENABLED) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("My Event Planner API")
      .setDescription("Event planning and budget control platform — REST API")
      .setVersion("1.0")
      .addCookieAuth("mep_session")
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(env.API_PORT);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.API_PORT}/api/v1 (docs: /docs)`);
}

void bootstrap();
