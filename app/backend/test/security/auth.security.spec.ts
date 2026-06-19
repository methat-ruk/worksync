import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

describe("authentication security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
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
  });

  afterAll(async () => {
    await app.close();
  });

  it("issues only the minimum identity claim plus standard JWT timing claims", () => {
    const payload = new JwtService().decode(accessToken);
    expect(payload).toEqual({
      sub: userId,
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
});
