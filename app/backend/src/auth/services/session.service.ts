import { randomUUID } from "node:crypto";

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import type { Environment } from "../../config/environment";
import { PrismaService } from "../../database/prisma.service";
import type { Prisma } from "../../generated/prisma/client";
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
    private readonly refreshTokens: RefreshTokenService
  ) {}

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
      await this.revokeSession(session.id);
      throw this.invalidRefreshToken();
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
      await this.revokeSession(session.id);
      throw this.invalidRefreshToken();
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

  private async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
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
