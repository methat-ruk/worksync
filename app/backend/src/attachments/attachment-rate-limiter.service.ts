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

@Injectable()
export class AttachmentRateLimiterService {
  constructor(
    @Inject(AUTH_RATE_LIMIT_STORE)
    private readonly store: AuthRateLimitStore
  ) {}

  async consume(actorId: string, workspaceId: string): Promise<void> {
    let actorCount: number;
    let workspaceCount: number;
    try {
      [actorCount, workspaceCount] = await Promise.all([
        this.store.consume(
          `worksync:attachment-rate:actor:${digest(actorId)}`,
          UPLOAD_WINDOW_MS
        ),
        this.store.consume(
          `worksync:attachment-rate:workspace:${digest(workspaceId)}`,
          UPLOAD_WINDOW_MS
        )
      ]);
    } catch {
      throw new ServiceUnavailableException({
        message: "Upload protection is temporarily unavailable",
        code: API_ERROR_CODE.SERVICE_NOT_READY
      });
    }

    if (
      actorCount <= ACTOR_UPLOAD_LIMIT &&
      workspaceCount <= WORKSPACE_UPLOAD_LIMIT
    ) {
      return;
    }

    throw new HttpException(
      {
        message: "Too many upload attempts. Please try again later.",
        code: API_ERROR_CODE.RATE_LIMITED,
        retryAfterSeconds: Math.ceil(UPLOAD_WINDOW_MS / 1_000)
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
