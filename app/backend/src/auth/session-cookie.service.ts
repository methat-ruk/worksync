import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Response } from "express";

import type { Environment } from "../config/environment";

export const REFRESH_TOKEN_COOKIE = "worksync_refresh_token";

@Injectable()
export class SessionCookieService {
  constructor(
    private readonly config: ConfigService<Environment, true>
  ) {}

  read(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) {
      return null;
    }

    for (const part of cookieHeader.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) {
        continue;
      }
      const name = part.slice(0, separator).trim();
      if (name !== REFRESH_TOKEN_COOKIE) {
        continue;
      }
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return null;
      }
    }
    return null;
  }

  set(response: Response, token: string, expiresAt: Date): void {
    response.cookie(REFRESH_TOKEN_COOKIE, token, {
      ...this.baseOptions(),
      expires: expiresAt,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now())
    });
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_TOKEN_COOKIE, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    const domain = this.config.get("COOKIE_DOMAIN", { infer: true });
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      path: "/api/auth",
      ...(domain ? { domain } : {})
    };
  }
}
