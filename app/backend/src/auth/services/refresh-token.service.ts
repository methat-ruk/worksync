import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import type { Environment } from "../../config/environment";
import type { RefreshTokenPayload } from "../types/auth.types";

export type IssuedRefreshToken = {
  refreshToken: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Environment, true>
  ) {}

  async issue(
    userId: string,
    sessionId: string,
    expiresAt: Date
  ): Promise<IssuedRefreshToken> {
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1_000);
    const nowSeconds = Math.floor(Date.now() / 1_000);

    if (expiresAtSeconds <= nowSeconds) {
      throw this.invalidToken();
    }

    const refreshToken = await this.jwtService.signAsync(
      { exp: expiresAtSeconds, sid: sessionId },
      {
        algorithm: "HS256",
        jwtid: randomUUID(),
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
        subject: userId
      }
    );

    return {
      refreshToken,
      refreshTokenHash: this.hash(refreshToken),
      expiresAt
    };
  }

  async verify(token: string): Promise<RefreshTokenPayload> {
    return this.verifyClaims(token, false);
  }

  async inspectForLogout(token: string): Promise<RefreshTokenPayload | null> {
    try {
      return await this.verifyClaims(token, true);
    } catch {
      return null;
    }
  }

  matches(token: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  hash(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  private async verifyClaims(
    token: string,
    ignoreExpiration: boolean
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          algorithms: ["HS256"],
          ignoreExpiration,
          secret: this.config.get("JWT_REFRESH_SECRET", { infer: true })
        }
      );
      if (
        typeof payload.sub !== "string" ||
        payload.sub.length === 0 ||
        typeof payload.sid !== "string" ||
        payload.sid.length === 0 ||
        typeof payload.jti !== "string" ||
        payload.jti.length === 0 ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        throw new Error("Invalid refresh-token payload");
      }
      return payload;
    } catch {
      throw this.invalidToken();
    }
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException({
      message: "Invalid refresh token",
      code: API_ERROR_CODE.INVALID_REFRESH_TOKEN
    });
  }
}
