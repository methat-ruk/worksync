import type { IncomingMessage, ServerResponse } from "node:http";

import { Module, RequestMethod } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import type { SerializerFn } from "pino";
import type { Options as PinoHttpOptions } from "pino-http";

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

type RequestWithDiagnostics = IncomingMessage & {
  id?: unknown;
  originalUrl?: string;
  user?: {
    id?: unknown;
  };
};

function sanitizeUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    return new URL(rawUrl, "http://worksync.local").pathname;
  } catch {
    return rawUrl.split("?")[0];
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : undefined;
}

function serializeRequest(request: RequestWithDiagnostics): object {
  return {
    id: stringValue(request.id),
    method: request.method,
    url: sanitizeUrl(request.originalUrl ?? request.url),
    ...(stringValue(request.user?.id)
      ? { userId: stringValue(request.user?.id) }
      : {})
  };
}

function serializeResponse(response: ServerResponse): object {
  return {
    statusCode: response.statusCode
  };
}

function httpLogType(
  response: ServerResponse,
  error?: Error
): "http_access" | "http_error" {
  return response.statusCode >= 500 || error ? "http_error" : "http_access";
}

export function createPinoHttpOptions(
  config: ConfigService<Environment, true>
): WorkSyncPinoHttpOptions {
  const isDevelopment = config.get("NODE_ENV", { infer: true }) === "development";

  return {
    level: config.get("LOG_LEVEL", { infer: true }),
    ...(isDevelopment
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
              singleLine: true,
              translateTime: "SYS:standard"
            }
          }
        }
      : {}),
    genReqId(request: IncomingMessage, response: ServerResponse) {
      const correlationId = resolveCorrelationId(
        request.headers[CORRELATION_ID_HEADER]
      );
      response.setHeader(CORRELATION_ID_HEADER, correlationId);
      return correlationId;
    },
    customProps(request: RequestWithDiagnostics) {
      return {
        requestId: request.id,
        correlationId: request.id,
        ...(stringValue(request.user?.id)
          ? { userId: stringValue(request.user?.id) }
          : {})
      };
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
    customSuccessMessage() {
      return "http request completed";
    },
    customErrorMessage() {
      return "http request failed";
    },
    customSuccessObject(_request, response, value) {
      return {
        ...value,
        event: "http_request_completed",
        logType: httpLogType(response)
      };
    },
    customErrorObject(_request, response, error, value) {
      return {
        ...value,
        event: "http_request_failed",
        logType: httpLogType(response, error)
      };
    },
    quietReqLogger: true,
    serializers: {
      req: serializeRequest,
      res: serializeResponse
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
        forRoutes: [
          {
            path: "{*path}",
            method: RequestMethod.ALL
          }
        ],
        pinoHttp: createPinoHttpOptions(config)
      })
    })
  ],
  providers: [CorrelationContextService],
  exports: [CorrelationContextService]
})
export class ObservabilityModule {}
