import { randomUUID } from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import type { Environment } from "../../config/environment";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
import { CorrelationContextService } from "../../observability/correlation-context.service";
import type { AuthDataDto } from "../dto/auth.dto";
import type { PublicUser } from "../types/auth.types";
import {
  AccessTokenService,
  type IssuedAccessToken
} from "./access-token.service";
import {
  RefreshTokenService,
  type IssuedRefreshToken
} from "./refresh-token.service";

const SESSION_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

export const REFRESH_CONCURRENCY_GRACE_MS = 5_000;

export type RefreshReuseClassification =
  | "CONCURRENCY_CONFLICT"
  | "REPLAY"
  | "UNCLASSIFIABLE";

export function classifyRefreshReuse(
  lastUsedAt: Date,
  now: Date
): RefreshReuseClassification {
  const elapsedMs = now.getTime() - lastUsedAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return "UNCLASSIFIABLE";
  }
  return elapsedMs <= REFRESH_CONCURRENCY_GRACE_MS
    ? "CONCURRENCY_CONFLICT"
    : "REPLAY";
}

type ObservedSession = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
};

export type SessionAuthentication = {
  data: AuthDataDto;
  refreshToken: string;
  refreshExpiresAt: Date;
};

function sanitizeUserAgent(userAgent: string | undefined): string | null {
  if (!userAgent) {
    return null;
  }
  const sanitized = Array.from(userAgent, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? " " : character;
  })
    .join("")
    .trim();
  return sanitized ? sanitized.slice(0, 512) : null;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly logger: PinoLogger,
    private readonly correlationContext: CorrelationContextService
  ) {
    this.logger.setContext(SessionService.name);
  }

  async create(
    user: PublicUser,
    userAgent: string | undefined,
    database: Prisma.TransactionClient | PrismaService = this.prisma
  ): Promise<SessionAuthentication> {
    const sessionId = randomUUID();
    const expiresAt = new Date(
      Date.now() +
        this.config.get("JWT_REFRESH_EXPIRES_IN", { infer: true }) * 1_000
    );
    const refresh = await this.refreshTokens.issue(
      user.id,
      sessionId,
      expiresAt
    );
    const access = await this.accessTokens.issue(user.id, sessionId);

    await database.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: refresh.refreshTokenHash,
        userAgent: sanitizeUserAgent(userAgent),
        expiresAt
      }
    });

    return this.authentication(user, access, refresh);
  }

  async refresh(
    refreshToken: string,
    userAgent: string | undefined
  ): Promise<SessionAuthentication> {
    const payload = await this.refreshTokens.verify(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        user: { select: SESSION_USER_SELECT }
      }
    });
    const now = new Date();

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw this.invalidRefreshToken();
    }

    if (!this.refreshTokens.matches(refreshToken, session.refreshTokenHash)) {
      await this.rejectStaleRefresh(session, now, "HASH_MISMATCH");
    }

    const nextRefresh = await this.refreshTokens.issue(
      session.userId,
      session.id,
      session.expiresAt
    );
    const nextAccess = await this.accessTokens.issue(
      session.userId,
      session.id
    );
    const nextUserAgent = sanitizeUserAgent(userAgent);
    const updated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        userId: session.userId,
        refreshTokenHash: session.refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      data: {
        refreshTokenHash: nextRefresh.refreshTokenHash,
        lastUsedAt: now,
        ...(nextUserAgent ? { userAgent: nextUserAgent } : {})
      }
    });

    if (updated.count !== 1) {
      const current = await this.readObservedSession(session.id);
      if (
        !current ||
        current.userId !== session.userId ||
        current.revokedAt ||
        current.expiresAt <= now
      ) {
        throw this.invalidRefreshToken();
      }
      await this.rejectStaleRefresh(current, new Date(), "CAS_LOST");
    }

    return this.authentication(session.user, nextAccess, nextRefresh);
  }

  async revokeFromToken(refreshToken: string): Promise<void> {
    const payload = await this.refreshTokens.inspectForLogout(refreshToken);
    if (!payload) {
      return;
    }
    await this.prisma.authSession.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async findActivePublicUser(
    sessionId: string,
    userId: string
  ): Promise<PublicUser | null> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: { user: { select: SESSION_USER_SELECT } }
    });
    return session?.user ?? null;
  }

  private async readObservedSession(
    sessionId: string
  ): Promise<ObservedSession | null> {
    return this.prisma.authSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        userId: true,
        refreshTokenHash: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true
      }
    });
  }

  private async rejectStaleRefresh(
    observed: ObservedSession,
    now: Date,
    source: "HASH_MISMATCH" | "CAS_LOST",
    retry = true
  ): Promise<never> {
    const classification = classifyRefreshReuse(observed.lastUsedAt, now);
    if (classification === "CONCURRENCY_CONFLICT") {
      this.logRefreshEvent(
        "info",
        "refresh_concurrency_conflict",
        `${source}_WITHIN_GRACE`,
        "Session refresh concurrency conflict"
      );
      throw new HttpException(
        {
          message: "Session refresh conflicted; retry shortly",
          code: API_ERROR_CODE.REFRESH_CONCURRENCY_CONFLICT,
          retryAfterSeconds: 1
        },
        HttpStatus.CONFLICT
      );
    }

    if (classification === "UNCLASSIFIABLE") {
      this.throwUnclassifiableRefresh(`${source}_CLOCK_STATE`);
    }

    const revoked = await this.prisma.authSession.updateMany({
      where: {
        id: observed.id,
        userId: observed.userId,
        refreshTokenHash: observed.refreshTokenHash,
        lastUsedAt: observed.lastUsedAt,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      data: { revokedAt: now }
    });
    if (revoked.count === 1) {
      this.logRefreshEvent(
        "warn",
        "refresh_replay_revoked",
        `${source}_OUTSIDE_GRACE`,
        "Refresh token replay revoked session"
      );
      throw this.invalidRefreshToken();
    }

    const current = await this.readObservedSession(observed.id);
    if (
      !current ||
      current.userId !== observed.userId ||
      current.revokedAt ||
      current.expiresAt <= now
    ) {
      throw this.invalidRefreshToken();
    }
    if (retry) {
      return this.rejectStaleRefresh(current, new Date(), source, false);
    }
    this.throwUnclassifiableRefresh(`${source}_STATE_CHANGED_REPEATEDLY`);
  }

  private throwUnclassifiableRefresh(reasonCode: string): never {
    this.logRefreshEvent(
      "warn",
      "refresh_classification_unexpected",
      reasonCode,
      "Refresh state could not be classified safely"
    );
    throw new ServiceUnavailableException({
      message: "Authentication is temporarily unavailable",
      code: API_ERROR_CODE.SERVICE_NOT_READY,
      suppressUnhandledRequestLog: true
    });
  }

  private logRefreshEvent(
    level: "info" | "warn",
    event: string,
    reasonCode: string,
    message: string
  ): void {
    this.logger[level](
      {
        logType: "business_event",
        event,
        reasonCode,
        correlationId: this.correlationContext.getCorrelationId()
      },
      message
    );
  }

  private authentication(
    user: PublicUser,
    access: IssuedAccessToken,
    refresh: IssuedRefreshToken
  ): SessionAuthentication {
    return {
      data: { user, ...access },
      refreshToken: refresh.refreshToken,
      refreshExpiresAt: refresh.expiresAt
    };
  }

  private invalidRefreshToken(): UnauthorizedException {
    return new UnauthorizedException({
      message: "Invalid refresh token",
      code: API_ERROR_CODE.INVALID_REFRESH_TOKEN
    });
  }
}
