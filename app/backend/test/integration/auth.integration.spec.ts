import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

function refreshCookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!cookie) {
    throw new Error("Expected refresh-token cookie");
  }
  return cookie.split(";")[0]!;
}

describeWithDatabase("authentication PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `auth-${Date.now()}@example.com`;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: "auth-" } }
    });
    await app.close();
  });

  it("persists a hash, authenticates, and resolves /me through PostgreSQL", async () => {
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "  Database User  ",
        email: email.toUpperCase(),
        password: "correct horse battery staple"
      })
      .expect(201);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true }
    });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(stored.passwordHash).not.toContain(
      "correct horse battery staple"
    );
    expect(JSON.stringify(signup.body)).not.toContain("passwordHash");

    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: `  ${email.toUpperCase()}  `,
        password: "correct horse battery staple"
      })
      .expect(200);
    expect(login.body.data.user.email).toBe(email);

    const me = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${login.body.data.accessToken as string}`)
      .expect(200);
    expect(me.body.data.user).toEqual(login.body.data.user);
    expect(me.body.data.user).not.toHaveProperty("passwordHash");
  });

  it("enforces normalized email uniqueness", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Duplicate",
        email: ` ${email.toUpperCase()} `,
        password: "another secure password"
      })
      .expect(409);
    expect(response.body.data.code).toBe("AUTH_EMAIL_CONFLICT");
  });

  it("persists only a refresh-token hash and revokes the family on reuse", async () => {
    const lifecycleEmail = `auth-lifecycle-${Date.now()}@example.com`;
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Lifecycle User",
        email: lifecycleEmail,
        password: "correct horse battery staple"
      })
      .expect(201);
    const originalCookie = refreshCookie(signup);
    const originalToken = originalCookie.split("=")[1]!;
    const payload = new JwtService().decode(
      signup.body.data.accessToken as string
    );
    const stored = await prisma.authSession.findUniqueOrThrow({
      where: { id: payload.sid as string }
    });
    expect(stored.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.refreshTokenHash).not.toContain(originalToken);

    const rotated = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", originalCookie)
      .expect(200);
    expect(refreshCookie(rotated)).not.toBe(originalCookie);

    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", originalCookie)
      .expect(401);
    const revoked = await prisma.authSession.findUniqueOrThrow({
      where: { id: stored.id }
    });
    expect(revoked.revokedAt).toBeInstanceOf(Date);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("authorization", `Bearer ${rotated.body.data.accessToken as string}`)
      .expect(401);
  });

  it("revokes all persisted sessions for a user", async () => {
    const logoutEmail = `auth-logout-all-${Date.now()}@example.com`;
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Logout All User",
        email: logoutEmail,
        password: "correct horse battery staple"
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        email: logoutEmail,
        password: "correct horse battery staple"
      })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/auth/logout-all")
      .set("authorization", `Bearer ${signup.body.data.accessToken as string}`)
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: logoutEmail }
    });
    const activeSessions = await prisma.authSession.count({
      where: { userId: user.id, revokedAt: null }
    });
    expect(activeSessions).toBe(0);
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .set("cookie", refreshCookie(login))
      .expect(401);
  });

  it("allows only one concurrent refresh and revokes the raced session", async () => {
    const concurrentEmail = `auth-concurrent-${Date.now()}@example.com`;
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Concurrent Refresh",
        email: concurrentEmail,
        password: "correct horse battery staple"
      })
      .expect(201);
    const cookie = refreshCookie(signup);
    const responses = await Promise.all([
      request(app.getHttpServer()).post("/api/auth/refresh").set("cookie", cookie),
      request(app.getHttpServer()).post("/api/auth/refresh").set("cookie", cookie)
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    const successful = responses.find(({ status }) => status === 200);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set(
        "authorization",
        `Bearer ${successful?.body.data.accessToken as string}`
      )
      .expect(401);
  });
});
