import {
  RequestMethod,
  ValidationPipe,
  type INestApplication
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/errors/global-exception.filter";
import type { Environment } from "./config/environment";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "./observability/correlation";
import { CorrelationContextService } from "./observability/correlation-context.service";
import { REFRESH_TOKEN_COOKIE } from "./auth/session-cookie.service";

type RequestWithId = Request & {
  id?: string;
};

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApplication(app);
  const config = app.get(ConfigService<Environment, true>);
  const port = config.get("PORT", { infer: true });
  await app.listen(port);
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  const logger = app.get(Logger);
  const correlationContext = app.get(CorrelationContextService);

  app.useLogger(logger);
  app.flushLogs();
  app.enableShutdownHooks();
  app.setGlobalPrefix("api", {
    exclude: [
      { path: "health", method: RequestMethod.GET },
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET }
    ]
  });
  app.enableCors({
    origin: config.get("CORS_ORIGIN", { infer: true }),
    credentials: true
  });

  app.use((request: RequestWithId, response: Response, next: NextFunction) => {
    const correlationId = resolveCorrelationId(
      request.id ?? request.headers[CORRELATION_ID_HEADER]
    );
    request.id = correlationId;
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    correlationContext.run(correlationId, next);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new GlobalExceptionFilter(logger, correlationContext));

  const swaggerConfig = new DocumentBuilder()
    .setTitle("WorkSync API")
    .setDescription("WorkSync backend API")
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT access token"
      },
      "access-token"
    )
    .addCookieAuth(
      REFRESH_TOKEN_COOKIE,
      { type: "apiKey", in: "cookie" },
      "refresh-token"
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, swaggerDocument);
}

if (require.main === module) {
  void bootstrap().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown startup error";
    const stack = error instanceof Error ? error.stack : undefined;
    process.stderr.write(
      `${JSON.stringify({
        level: "fatal",
        message: "Backend startup failed",
        error: message,
        ...(stack ? { stack } : {})
      })}\n`
    );
    process.exitCode = 1;
  });
}
