import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import type { Environment } from "../config/environment";
import type { AccessTokenPayload } from "./auth.types";

type IssuedAccessToken = {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

@Injectable()
export class AccessTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Environment, true>
  ) {}

  async issue(userId: string): Promise<IssuedAccessToken> {
    const expiresIn = this.config.get("JWT_ACCESS_EXPIRES_IN", { infer: true });
    const accessToken = await this.jwtService.signAsync(
      {},
      {
        algorithm: "HS256",
        subject: userId,
        expiresIn
      }
    );

    return { accessToken, tokenType: "Bearer", expiresIn };
  }

  async verify(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { algorithms: ["HS256"] }
      );
      if (
        typeof payload.sub !== "string" ||
        payload.sub.length === 0 ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        throw new Error("Invalid access-token payload");
      }

      return payload;
    } catch {
      throw new UnauthorizedException({
        message: "Invalid access token",
        code: API_ERROR_CODE.INVALID_ACCESS_TOKEN
      });
    }
  }
}
