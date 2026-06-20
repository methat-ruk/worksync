import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { RefreshTokenService } from "../../src/auth/refresh-token.service";
import type { Environment } from "../../src/config/environment";

describe("RefreshTokenService", () => {
  let service: RefreshTokenService;

  beforeEach(() => {
    const config = new ConfigService<Environment, true>({
      JWT_REFRESH_SECRET:
        "test-refresh-secret-with-at-least-thirty-two-bytes"
    });
    service = new RefreshTokenService(new JwtService(), config);
  });

  it("issues minimum claims bounded by the absolute session expiry", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const issued = await service.issue("user-1", "session-1", expiresAt);
    const payload = new JwtService().decode(issued.refreshToken);

    expect(payload).toEqual({
      sub: "user-1",
      sid: "session-1",
      jti: expect.any(String),
      iat: expect.any(Number),
      exp: Math.floor(expiresAt.getTime() / 1_000)
    });
    expect(issued.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(service.matches(issued.refreshToken, issued.refreshTokenHash)).toBe(
      true
    );
  });

  it("rejects malformed tokens and can inspect expired tokens for logout", async () => {
    await expect(service.verify("not-a-token")).rejects.toMatchObject({
      response: { code: "INVALID_REFRESH_TOKEN" }
    });

    const expiredToken = new JwtService({
      secret: "test-refresh-secret-with-at-least-thirty-two-bytes"
    }).sign(
      { sid: "session-1" },
      {
        subject: "user-1",
        jwtid: "expired-token",
        algorithm: "HS256",
        expiresIn: -1
      }
    );
    await expect(service.verify(expiredToken)).rejects.toMatchObject({
      response: { code: "INVALID_REFRESH_TOKEN" }
    });
    await expect(
      service.inspectForLogout(expiredToken)
    ).resolves.toMatchObject({
      sub: "user-1",
      sid: "session-1"
    });
  });
});
