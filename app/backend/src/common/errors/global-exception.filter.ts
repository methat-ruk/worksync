import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
  type LoggerService
} from "@nestjs/common";
import type { Response } from "express";

import { Prisma } from "../../generated/prisma/client";
import { CorrelationContextService } from "../../observability/correlation-context.service";
import { API_ERROR_CODE, isApiErrorCode } from "./api-error-code";
import type { ApiErrorResponseDto } from "./api-error.dto";

type NormalizedError = {
  status: number;
  body: ApiErrorResponseDto;
};

function validationFields(messages: string[]): Record<string, string[]> {
  return messages.reduce<Record<string, string[]>>((fields, message) => {
    const unknownFieldMatch = /^property (\S+) should not exist$/.exec(message);
    const field =
      unknownFieldMatch?.[1] ?? message.split(" ")[0] ?? "request";
    fields[field] = [...(fields[field] ?? []), message];
    return fields;
  }, {});
}

function normalizeHttpException(exception: HttpException): NormalizedError {
  const status = exception.getStatus();
  const response = exception.getResponse();

  if (exception instanceof BadRequestException && typeof response === "object") {
    const messages = (response as { message?: unknown }).message;
    if (Array.isArray(messages) && messages.every((item) => typeof item === "string")) {
      return {
        status,
        body: {
          success: false,
          message: "Validation failed",
          data: {
            code: API_ERROR_CODE.VALIDATION_ERROR,
            fields: validationFields(messages)
          }
        }
      };
    }
  }

  if (typeof response === "object") {
    const details = response as { message?: unknown; code?: unknown };
    const message =
      typeof details.message === "string" ? details.message : exception.message;
    const code = isApiErrorCode(details.code) ? details.code : undefined;
    return {
      status,
      body: {
        success: false,
        message,
        ...(code ? { data: { code } } : {})
      }
    };
  }

  return {
    status,
    body: {
      success: false,
      message: typeof response === "string" ? response : exception.message
    }
  };
}

export function normalizeException(exception: unknown): NormalizedError {
  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === "P2002") {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          success: false,
          message: "A resource with the same unique value already exists",
          data: { code: API_ERROR_CODE.RESOURCE_CONFLICT }
        }
      };
    }

    if (exception.code === "P2025") {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          success: false,
          message: "Resource not found",
          data: { code: API_ERROR_CODE.RESOURCE_NOT_FOUND }
        }
      };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      success: false,
      message: "Internal server error",
      data: { code: API_ERROR_CODE.INTERNAL_SERVER_ERROR }
    }
  };
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService,
    private readonly correlationContext: CorrelationContextService
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const normalized = normalizeException(exception);
    const correlationId = this.correlationContext.getCorrelationId();
    const data = {
      ...normalized.body.data,
      ...(correlationId ? { correlationId } : {})
    };
    const body: ApiErrorResponseDto = {
      ...normalized.body,
      ...(Object.keys(data).length > 0 ? { data } : {})
    };
    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const retryAfterSeconds =
        typeof exceptionResponse === "object" &&
        typeof (exceptionResponse as { retryAfterSeconds?: unknown })
          .retryAfterSeconds === "number"
          ? (exceptionResponse as { retryAfterSeconds: number })
              .retryAfterSeconds
          : undefined;
      if (retryAfterSeconds !== undefined) {
        response.setHeader("Retry-After", String(retryAfterSeconds));
      }
    }

    if (normalized.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const trace = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `Unhandled request error correlationId=${correlationId ?? "unknown"}`,
        trace,
        GlobalExceptionFilter.name
      );
    }

    response.status(normalized.status).json(body);
  }
}
