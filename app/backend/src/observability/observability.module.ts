import type { IncomingMessage, ServerResponse } from "node:http";

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import type { SerializerFn } from "pino";
import {
  stdSerializers,
  type Options as PinoHttpOptions
} from "pino-http";

import type { Environment } from "../config/environment";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "./correlation";
import { CorrelationContextService } from "./correlation-context.service";

type WorkSyncPinoHttpOptions = PinoHttpOptions<
  IncomingMessage,
  ServerResponse
> & {
  serializers: Record<string, SerializerFn>;
  redact: {
    paths: string[];
    censor: string;
  };
};

export function createPinoHttpOptions(
  config: ConfigService<Environment, true>
): WorkSyncPinoHttpOptions {
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
    serializers: {
      req(request: IncomingMessage & {
        originalUrl?: string;
        query?: Record<string, unknown>;
      }) {
        const serialized = stdSerializers.req(request);
        if (
          typeof serialized.url === "string" &&
          serialized.url.startsWith("/api/auth/google/callback")
        ) {
          serialized.url = "/api/auth/google/callback";
          serialized.query = {};
        }
        return serialized;
      }
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['set-cookie']",
        "res.headers['set-cookie']",
        "res.headers.location",
        "*.password",
        "*.passwordHash",
        "*.token",
        "*.accessToken",
        "*.refreshToken",
        "*.refreshTokenHash",
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
