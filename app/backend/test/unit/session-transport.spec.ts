import type { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";

import { AuthOriginGuard } from "../../src/auth/auth-origin.guard";
import {
  REFRESH_TOKEN_COOKIE,
  SessionCookieService
} from "../../src/auth/session-cookie.service";
import type { Environment } from "../../src/config/environment";

describe("session transport", () => {
  it("sets and clears a scoped HttpOnly refresh cookie", () => {
    const config = new ConfigService<Environment, true>({
      COOKIE_SECURE: true,
      COOKIE_DOMAIN: "example.com"
    });
    const cookies = new SessionCookieService(config);
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn()
    } as unknown as Response;
    const expiresAt = new Date(Date.now() + 60_000);

    cookies.set(response, "refresh-token", expiresAt);
    cookies.clear(response);

    expect(response.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "refresh-token",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        domain: "example.com",
        path: "/api/auth",
        expires: expiresAt
      })
    );
    expect(response.clearCookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/api/auth"
      })
    );
    expect(
      cookies.read(`other=value; ${REFRESH_TOKEN_COOKIE}=encoded%20token`)
    ).toBe("encoded token");
  });

  it("allows absent or configured origins and rejects other browser origins", () => {
    const guard = new AuthOriginGuard(
      new ConfigService<Environment, true>({
        CORS_ORIGIN: "https://app.example.com"
      })
    );
    const contextFor = (origin?: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () =>
            ({ headers: { ...(origin ? { origin } : {}) } }) as Request
        })
      }) as ExecutionContext;

    expect(guard.canActivate(contextFor())).toBe(true);
    expect(guard.canActivate(contextFor("https://app.example.com"))).toBe(
      true
    );
    expect(() =>
      guard.canActivate(contextFor("https://attacker.example"))
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: "INVALID_REQUEST_ORIGIN"
        })
      })
    );
  });
});
