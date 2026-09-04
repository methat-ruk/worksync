import { createHash } from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";

import {
  AUTH_RATE_LIMIT_STORE,
  type AuthRateLimitStore
} from "../auth/services/auth-rate-limit.service";
import { API_ERROR_CODE } from "../common/errors/api-error-code";

const UPLOAD_WINDOW_MS = 10 * 60 * 1_000;
const ACTOR_UPLOAD_LIMIT = 10;
const WORKSPACE_UPLOAD_LIMIT = 100;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uploadRateLimited(): HttpException {
  return new HttpException(
    {
      message: "Too many upload attempts. Please try again later.",
      code: API_ERROR_CODE.RATE_LIMITED,
      retryAfterSeconds: Math.ceil(UPLOAD_WINDOW_MS / 1_000)
    },
    HttpStatus.TOO_MANY_REQUESTS
  );
}

@Injectable()
export class AttachmentRateLimiterService {
  constructor(
    @Inject(AUTH_RATE_LIMIT_STORE)
    private readonly store: AuthRateLimitStore
  ) {}

  async consume(actorId: string, workspaceId: string): Promise<void> {
    const actorAllowed = await this.consumeWithinLimit(
      `worksync:attachment-rate:actor:${digest(actorId)}`,
      ACTOR_UPLOAD_LIMIT
    );
    if (!actorAllowed) {
      throw uploadRateLimited();
    }

    const workspaceAllowed = await this.consumeWithinLimit(
      `worksync:attachment-rate:workspace:${digest(workspaceId)}`,
      WORKSPACE_UPLOAD_LIMIT
    );
    if (!workspaceAllowed) {
      throw uploadRateLimited();
    }
  }

  private async consumeWithinLimit(
    key: string,
    limit: number
  ): Promise<boolean> {
    try {
      return (await this.store.consume(key, UPLOAD_WINDOW_MS)) <= limit;
    } catch {
      throw new ServiceUnavailableException({
        message: "Upload protection is temporarily unavailable",
        code: API_ERROR_CODE.SERVICE_NOT_READY
      });
    }
  }
}
