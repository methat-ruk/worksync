import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

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
});

