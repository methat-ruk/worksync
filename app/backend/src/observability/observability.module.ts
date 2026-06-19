import type { IncomingMessage, ServerResponse } from "node:http";

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";

import type { Environment } from "../config/environment";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "./correlation";
import { CorrelationContextService } from "./correlation-context.service";

export function createPinoHttpOptions(
  config: ConfigService<Environment, true>
) {
  return {
    level: config.get("LOG_LEVEL", { infer: true }),
    genReqId(request: IncomingMessage, response: ServerResponse) {
      const correlationId = resolveCorrelationId(
        request.headers[CORRELATION_ID_HEADER]
      );
      response.setHeader(CORRELATION_ID_HEADER, correlationId);
      return correlationId;
    },
    customProps(request: IncomingMessage & { id?: unknown }) {
      return { correlationId: request.id };
    },
    customLogLevel(
      request: IncomingMessage,
      response: ServerResponse,
      error?: Error
    ) {
      if (
        request.url?.startsWith("/health") &&
        response.statusCode < 400 &&
        !error
      ) {
        return "silent" as const;
      }
      if (response.statusCode >= 500 || error) {
        return "error" as const;
      }
      if (response.statusCode >= 400) {
        return "warn" as const;
      }
      return "info" as const;
    },
    quietReqLogger: true,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['set-cookie']",
        "res.headers['set-cookie']",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.accessToken",
        "*.refreshToken",
        "*.secret",
        "*.apiKey"
      ],
      censor: "[REDACTED]"
    }
  };
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        pinoHttp: createPinoHttpOptions(config)
      })
    })
  ],
  providers: [CorrelationContextService],
  exports: [CorrelationContextService]
})
export class ObservabilityModule {}
