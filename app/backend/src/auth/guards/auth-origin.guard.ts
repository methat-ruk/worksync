import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import type { Environment } from "../../config/environment";

@Injectable()
export class AuthOriginGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<Environment, true>
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    if (!origin) {
      return true;
    }

    const allowedOrigin = new URL(
      this.config.get("CORS_ORIGIN", { infer: true })
    ).origin;
    try {
      if (new URL(origin).origin === allowedOrigin) {
        return true;
      }
    } catch {
      // Fall through to the stable public failure.
    }

    throw new ForbiddenException({
      message: "Invalid request origin",
      code: API_ERROR_CODE.INVALID_REQUEST_ORIGIN
    });
  }
}
