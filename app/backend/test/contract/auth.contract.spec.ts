import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";
import { REFRESH_TOKEN_COOKIE } from "../../src/auth/services/session-cookie.service";

function getRefreshCookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = cookies.find((value) =>
    value.startsWith(`${REFRESH_TOKEN_COOKIE}=`)
  );
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
  if (cookies.length !== 3 || !location) {
    throw new Error("Expected Google OAuth transaction");
  }
  const state = new URL(location).searchParams.get("state");
  if (!state) {
    throw new Error("Expected OAuth state");
  }
  return {
    cookie: cookies.map((value) => value.split(";")[0]!).join("; "),
    state
  };
}

describe("authentication API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;

  beforeAll(async () => {
    context = await createAuthTestApp({
      googleProfile: {
        subject: "google-contract-subject",
        email: "google.contract@gmail.com",
        displayName: "Google Contract"
      }
    });
    app = context.app;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates an account with normalized email and the public auth envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "  Ada Lovelace  ",
        email: "  ADA@Example.com ",
        password: "correct horse battery staple"
      })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      message: "Account created",
      data: {
        user: {
          id: expect.any(String),
          email: "ada@example.com",
          displayName: "Ada Lovelace",
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        },
        accessToken: expect.any(String),
        tokenType: "Bearer",
        expiresIn: 900
      }
    });
    expect(response.body.data.user).not.toHaveProperty("passwordHash");
    expect(response.body.data).not.toHaveProperty("refreshToken");
    expect(response.headers["set-cookie"]?.[0]).toEqual(
      expect.stringContaining(`${REFRESH_TOKEN_COOKIE}=`)
    );
    expect(response.headers["set-cookie"]?.[0]).toEqual(
      expect.stringContaining("HttpOnly")
    );
    expect(response.headers["set-cookie"]?.[0]).toEqual(
      expect.stringContaining("SameSite=Lax")
    );
    expect(response.headers["set-cookie"]?.[0]).toEqual(
      expect.stringContaining("Path=/api/auth")
    );
  });

  it("returns the defined duplicate-email conflict", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Other Ada",
        email: "ADA@example.com",
        password: "another secure password"
      })
      .expect(409);

    expect(response.body).toMatchObject({
      success: false,
      message: "An account with this email already exists",
      data: {
        code: "AUTH_EMAIL_CONFLICT",
        correlationId: expect.any(String)
      }
    });
  });

  it("rejects invalid and unknown request fields through the standard envelope", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "",
        email: "invalid",
        password: "short",
        role: "OWNER"
      })
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      message: "Validation failed",
      data: {
        code: "VALIDATION_ERROR",
        fields: {
          displayName: expect.any(Array),
          email: expect.any(Array),
          password: expect.any(Array),
          role: expect.any(Array)
        }
      }
    });
  });

  it("rotates the refresh cookie and returns the existing auth envelope", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: "ada@example.com",
        password: "correct horse battery staple"
      })
      .expect(200);
    const refresh = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", getRefreshCookie(login))
      .expect(200);

    expect(refresh.body).toMatchObject({
      success: true,
      message: "Authentication refreshed",
      data: {
        user: { email: "ada@example.com" },
        accessToken: expect.any(String),
        tokenType: "Bearer",
        expiresIn: 900
      }
    });
    expect(refresh.body.data).not.toHaveProperty("refreshToken");
    expect(getRefreshCookie(refresh)).not.toBe(getRefreshCookie(login));
  });

  it("defines missing refresh cookie and invalid browser origin failures", async () => {
    const missing = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .expect(401);
    expect(missing.body.data.code).toBe("REFRESH_TOKEN_REQUIRED");

    const origin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("origin", "https://attacker.example")
      .send({
        email: "ada@example.com",
        password: "correct horse battery staple"
      })
      .expect(403);
    expect(origin.body.data.code).toBe("INVALID_REQUEST_ORIGIN");
  });

  it("keeps logout idempotent when the refresh cookie is absent", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/logout")
      .expect(200);
    expect(response.body).toEqual({ success: true, message: "Logged out" });
    expect(response.headers["set-cookie"]?.[0]).toEqual(
      expect.stringContaining(`${REFRESH_TOKEN_COOKIE}=`)
    );
  });

  it("starts Google OAuth with redirect and callback-scoped transaction cookies", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(response);

    expect(response.headers.location).toContain(
      "https://accounts.google.test/authorize"
    );
    expect(transaction.state).toEqual(expect.any(String));
    const setCookies = response.headers["set-cookie"];
    for (const cookie of Array.isArray(setCookies)
      ? setCookies
      : setCookies
        ? [setCookies]
        : []) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Path=/api/auth/google/callback");
      expect(cookie).toContain("Max-Age=600");
    }
  });

  it("completes Google OAuth through a generic frontend redirect and refresh cookie", async () => {
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    const callback = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "authorization-code", state: transaction.state })
      .set("cookie", transaction.cookie)
      .expect(303);

    expect(callback.headers.location).toBe(
      "http://localhost:3000/?auth=google-success"
    );
    expect(getRefreshCookie(callback)).toContain(REFRESH_TOKEN_COOKIE);
    expect(callback.headers.location).not.toContain("token");
    expect(callback.headers.location).not.toContain("email");
  });

  it("redirects cancellation and callback failures without provider details", async () => {
    const cancelledStart = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const cancelledTransaction = googleTransaction(cancelledStart);
    const cancelled = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({
        error: "access_denied",
        error_description: "sensitive provider description",
        state: cancelledTransaction.state
      })
      .set("cookie", cancelledTransaction.cookie)
      .expect(303);
    expect(cancelled.headers.location).toBe(
      "http://localhost:3000/?auth=google-cancelled"
    );

    const failed = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "secret-code", state: "wrong-state" })
      .expect(303);
    expect(failed.headers.location).toBe(
      "http://localhost:3000/?auth=google-error&code=GOOGLE_LOGIN_FAILED"
    );
    expect(failed.headers.location).not.toContain("secret-code");
    expect(failed.headers.location).not.toContain("sensitive");
  });

  it("documents auth requests, responses, bearer security, and errors", () => {
    const config = new DocumentBuilder()
      .setTitle("WorkSync API")
      .setVersion("0.1.0")
      .addBearerAuth(
        { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        "access-token"
      )
      .addCookieAuth(
        REFRESH_TOKEN_COOKIE,
        { type: "apiKey", in: "cookie" },
        "refresh-token"
      )
      .build();
    const document = SwaggerModule.createDocument(app, config);

    expect(document.paths["/api/auth/signup"]?.post).toMatchObject({
      requestBody: { required: true },
      responses: {
        "201": expect.any(Object),
        "400": expect.any(Object),
        "409": expect.any(Object)
      }
    });
    expect(document.paths["/api/auth/login"]?.post?.responses).toMatchObject({
      "200": expect.any(Object),
      "400": expect.any(Object),
      "401": expect.any(Object)
    });
    expect(document.paths["/api/auth/google"]?.get?.responses).toMatchObject({
      "302": expect.any(Object),
      "503": expect.any(Object)
    });
    expect(
      document.paths["/api/auth/google/callback"]?.get?.responses
    ).toMatchObject({
      "303": expect.any(Object),
      "503": expect.any(Object)
    });
    expect(document.paths["/api/auth/me"]?.get).toMatchObject({
      security: [{ "access-token": [] }],
      responses: {
        "200": expect.any(Object),
        "401": expect.any(Object)
      }
    });
    expect(document.paths["/api/auth/refresh"]?.post).toMatchObject({
      security: [{ "refresh-token": [] }],
      responses: {
        "200": expect.objectContaining({
          headers: expect.objectContaining({
            "Set-Cookie": expect.any(Object)
          })
        }),
        "401": expect.any(Object),
        "403": expect.any(Object)
      }
    });
    expect(document.paths["/api/auth/logout"]?.post?.responses).toMatchObject({
      "200": expect.any(Object),
      "403": expect.any(Object)
    });
    expect(document.paths["/api/auth/logout-all"]?.post).toMatchObject({
      security: [{ "access-token": [] }],
      responses: {
        "200": expect.any(Object),
        "401": expect.any(Object)
      }
    });
    expect(
      document.paths["/api/auth/login"]?.post?.responses?.["401"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorResponseDto" }
        }
      }
    });
    expect(document.paths["/health/ready"]?.get?.responses?.["503"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ApiErrorResponseDto" }
        }
      }
    });
    expect(document.components?.schemas).toHaveProperty("SignUpRequestDto");
    expect(document.components?.schemas).toHaveProperty("AuthResponseDto");
    expect(document.components?.schemas).toHaveProperty("ApiErrorResponseDto");
    expect(document.components?.schemas).toHaveProperty("ApiErrorDataDto");
    const errorDataSchema = document.components?.schemas?.ApiErrorDataDto;
    if (!errorDataSchema || "$ref" in errorDataSchema) {
      throw new Error("ApiErrorDataDto must be an inline OpenAPI schema");
    }
    expect(errorDataSchema.properties?.code).toMatchObject({
      enum: expect.arrayContaining([
        "AUTH_EMAIL_CONFLICT",
        "AUTHENTICATION_REQUIRED",
        "GOOGLE_LOGIN_FAILED",
        "GOOGLE_OAUTH_NOT_CONFIGURED",
        "INVALID_ACCESS_TOKEN",
        "INVALID_CREDENTIALS",
        "VALIDATION_ERROR"
      ])
    });
  });
});
