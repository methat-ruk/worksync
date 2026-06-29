import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

function refreshCookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) {
    throw new Error("Expected refresh-token cookie");
  }
  return cookie.split(";")[0]!;
}

function googleTransaction(response: request.Response): {
  cookie: string;
  state: string;
} {
  const header = response.headers["set-cookie"];
  const cookies = (Array.isArray(header) ? header : header ? [header] : [])
    .filter((value) => value.startsWith("worksync_google_oauth_"));
  const location = response.headers.location as string | undefined;
  const state = location ? new URL(location).searchParams.get("state") : null;
  if (cookies.length !== 3 || !state) {
    throw new Error("Expected Google OAuth transaction");
  }
  return {
    cookie: cookies.map((value) => value.split(";")[0]!).join("; "),
    state
  };
}

describe("authentication security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let accessToken: string;
  let userId: string;
  let sessionId: string;

  beforeAll(async () => {
    context = await createAuthTestApp({
      googleProfile: {
        subject: "google-security-subject",
        email: "google.security@gmail.com",
        displayName: "Google Security"
      }
    });
    app = context.app;
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Security Test",
        email: "security@example.com",
        password: "correct horse battery staple"
      })
      .expect(201);
    accessToken = signup.body.data.accessToken as string;
    userId = signup.body.data.user.id as string;
    sessionId = new JwtService().decode(accessToken).sid as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("issues only the minimum identity claim plus standard JWT timing claims", () => {
    const payload = new JwtService().decode(accessToken);
    expect(payload).toEqual({
      sub: userId,
      sid: sessionId,
      iat: expect.any(Number),
      exp: expect.any(Number)
    });
  });

  it("returns the authenticated public user without a password hash", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        user: {
          id: userId,
          email: "security@example.com"
        }
      }
    });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("scrypt$");
  });

  it("rejects missing and malformed credentials with their defined codes", async () => {
    const missing = await request(app.getHttpServer())
      .get("/api/auth/me")
      .expect(401);
    expect(missing.body.data.code).toBe("AUTHENTICATION_REQUIRED");

    const malformed = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", "Bearer")
      .expect(401);
    expect(malformed.body.data.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it.each([
    [
      "expired",
      new JwtService({
        secret: process.env.JWT_ACCESS_SECRET!
      }).sign({}, { subject: "user-1", algorithm: "HS256", expiresIn: -1 })
    ],
    [
      "invalidly signed",
      new JwtService({ secret: "different-secret-with-at-least-32-bytes" }).sign(
        {},
        { subject: "user-1", algorithm: "HS256", expiresIn: 900 }
      )
    ],
    ["malformed", "not-a-jwt"]
  ])("rejects %s tokens", async (_case, token) => {
    const response = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${token}`)
      .expect(401);

    expect(response.body.data.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("uses the same public failure for unknown email and incorrect password", async () => {
    const unknown = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: "unknown@example.com",
        password: "incorrect password"
      })
      .expect(401);
    const incorrect = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: "security@example.com",
        password: "incorrect password"
      })
      .expect(401);

    expect(unknown.body).toEqual(
      expect.objectContaining({
        success: false,
        message: "Invalid email or password",
        data: expect.objectContaining({ code: "INVALID_CREDENTIALS" })
      })
    );
    expect(incorrect.body).toEqual({
      ...unknown.body,
      data: {
        ...unknown.body.data,
        correlationId: expect.any(String)
      }
    });
  });

  it("rate-limits auth attempts without exposing identifiers or credentials", async () => {
    const rateLimitedContext = await createAuthTestApp({
      rateLimitedPolicies: ["LOGIN_IDENTITY"]
    });
    try {
      const response = await request(rateLimitedContext.app.getHttpServer())
        .post("/api/auth/login")
        .send({
          email: "sensitive-rate-limit@example.com",
          password: "secret password value"
        })
        .expect(429);

      const body = JSON.stringify(response.body);
      expect(response.body.data.code).toBe("RATE_LIMITED");
      expect(response.headers["retry-after"]).toBe("60");
      expect(body).not.toContain("sensitive-rate-limit@example.com");
      expect(body).not.toContain("secret password value");
      expect(body).not.toContain("Bearer");
      expect(body).not.toContain("worksync_refresh_token");
    } finally {
      await rateLimitedContext.app.close();
    }
  });

  it("never stores plaintext credentials", () => {
    const stored = [...context.users.values()].find(
      (user) => user.id === userId
    );
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain(
      "correct horse battery staple"
    );
  });

  it("rejects an otherwise valid token after its user no longer exists", async () => {
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Deleted User",
        email: "deleted@example.com",
        password: "correct horse battery staple"
      })
      .expect(201);
    context.users.delete(signup.body.data.user.id as string);

    const response = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set(
        "authorization",
        `Bearer ${signup.body.data.accessToken as string}`
      )
      .expect(401);
    expect(response.body.data.code).toBe("INVALID_ACCESS_TOKEN");
  });

  it("rejects refresh-token reuse and revokes that session family", async () => {
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Rotation User",
        email: "rotation@example.com",
        password: "correct horse battery staple"
      })
      .expect(201);
    const originalCookie = refreshCookie(signup);
    const rotated = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", originalCookie)
      .expect(200);

    const reuse = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", originalCookie)
      .expect(401);
    expect(reuse.body.data.code).toBe("INVALID_REFRESH_TOKEN");

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${rotated.body.data.accessToken as string}`)
      .expect(401);
  });

  it("invalidates the current access token immediately on logout", async () => {
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Logout User",
        email: "logout@example.com",
        password: "correct horse battery staple"
      })
      .expect(201);

    const logout = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .set("cookie", refreshCookie(signup))
      .expect(200);
    expect(logout.body).toEqual({ success: true, message: "Logged out" });
    expect(logout.headers["set-cookie"]?.[0]).toEqual(
      expect.stringContaining("Expires=Thu, 01 Jan 1970")
    );

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${signup.body.data.accessToken as string}`)
      .expect(401);
  });

  it("revokes every user session through logout-all", async () => {
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "All Sessions",
        email: "logout-all@example.com",
        password: "correct horse battery staple"
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: "logout-all@example.com",
        password: "correct horse battery staple"
      })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/auth/logout-all")
      .set("authorization", `Bearer ${signup.body.data.accessToken as string}`)
      .expect(200);

    for (const token of [
      signup.body.data.accessToken as string,
      login.body.data.accessToken as string
    ]) {
      await request(app.getHttpServer())
        .get("/api/auth/me")
        .set("authorization", `Bearer ${token}`)
        .expect(401);
    }
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", refreshCookie(login))
      .expect(401);
  });

  it("rejects wrong-signature, expired, and malformed refresh tokens", async () => {
    const jwt = new JwtService({
      secret: process.env.JWT_REFRESH_SECRET!
    });
    const claims = { sid: "session-1" };
    const cases = [
      new JwtService({
        secret: "different-refresh-secret-with-at-least-32-bytes"
      }).sign(claims, {
        subject: "user-1",
        jwtid: "wrong-signature",
        algorithm: "HS256",
        expiresIn: 900
      }),
      jwt.sign(claims, {
        subject: "user-1",
        jwtid: "expired",
        algorithm: "HS256",
        expiresIn: -1
      }),
      "not-a-refresh-token"
    ];

    for (const token of cases) {
      const response = await request(app.getHttpServer())
        .post("/api/auth/refresh")
        .set("cookie", `worksync_refresh_token=${token}`)
        .expect(401);
      expect(response.body.data.code).toBe("INVALID_REFRESH_TOKEN");
    }
  });

  it("rejects mismatched Google state before provider authentication", async () => {
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    const response = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "state-secret-code", state: "attacker-state" })
      .set("cookie", transaction.cookie)
      .expect(303);

    expect(response.headers.location).toBe(
      "http://localhost:3000/?auth=google-error&code=GOOGLE_LOGIN_FAILED"
    );
    expect(response.headers.location).not.toContain("state-secret-code");
    const cleared = response.headers["set-cookie"] as string[] | undefined;
    expect(cleared).toHaveLength(3);
    for (const cookie of cleared ?? []) {
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
      expect(cookie).toContain("Path=/api/auth/google/callback");
    }
  });

  it("maps Google authorization-code replay to the same generic redirect", async () => {
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    const first = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "single-use-code", state: transaction.state })
      .set("cookie", transaction.cookie)
      .expect(303);
    expect(first.headers.location).toBe(
      "http://localhost:3000/?auth=google-success"
    );

    const replay = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "single-use-code", state: transaction.state })
      .set("cookie", transaction.cookie)
      .expect(303);
    expect(replay.headers.location).toBe(
      "http://localhost:3000/?auth=google-error&code=GOOGLE_LOGIN_FAILED"
    );
  });

  it("never exposes Google transaction or provider material in redirects", async () => {
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    const failure = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({
        error: "provider_specific_failure",
        error_description: "provider-secret-description",
        state: transaction.state
      })
      .set("cookie", transaction.cookie)
      .expect(303);

    expect(failure.headers.location).toBe(
      "http://localhost:3000/?auth=google-error&code=GOOGLE_LOGIN_FAILED"
    );
    expect(failure.headers.location).not.toContain("provider");
    expect(failure.headers.location).not.toContain(transaction.state);
  });
});
