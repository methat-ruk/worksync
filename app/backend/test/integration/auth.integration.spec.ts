import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { GoogleIdentityService } from "../../src/auth/services/google-identity.service";
import { GoogleOAuthProviderService } from "../../src/auth/services/google-oauth-provider.service";
import { SessionService } from "../../src/auth/services/session.service";
import type { GoogleIdentityProfile } from "../../src/auth/types/google-oauth.types";
import { PrismaService } from "../../src/database/prisma.service";
import { AuthProvider } from "../../src/generated/prisma/client";
import { configureApplication } from "../../src/main";
import { createGoogleOAuthTestHarness } from "../helpers/google-oauth-test-harness";

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

function refreshCookie(response: request.Response): string {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = cookies.find((value) =>
    value.startsWith("worksync_refresh_token=")
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
  const state = location ? new URL(location).searchParams.get("state") : null;
  if (cookies.length !== 3 || !state) {
    throw new Error("Expected Google OAuth transaction");
  }
  return {
    cookie: cookies.map((value) => value.split(";")[0]!).join("; "),
    state
  };
}

describeWithDatabase("authentication PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let googleIdentities: GoogleIdentityService;
  let sessions: SessionService;
  const googleHarness = createGoogleOAuthTestHarness();
  const email = `auth-${Date.now()}@example.com`;

  function useGoogleProfile(
    profile: GoogleIdentityProfile
  ): GoogleIdentityProfile {
    googleHarness.setProfile(profile);
    return profile;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(GoogleOAuthProviderService)
      .useValue(googleHarness.provider)
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    googleIdentities = app.get(GoogleIdentityService);
    sessions = app.get(SessionService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        OR: [
          { email: { startsWith: "auth-" } },
          { email: { startsWith: "google-" } }
        ]
      }
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

  it("creates and reuses a Google identity without a password hash", async () => {
    const googleEmail = `google-new-${Date.now()}@gmail.com`;
    let googleProfile = useGoogleProfile({
      subject: `google-new-subject-${Date.now()}`,
      email: googleEmail,
      displayName: "Google New User"
    });
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    const callback = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "code-1", state: transaction.state })
      .set("cookie", transaction.cookie)
      .expect(303);
    expect(callback.headers.location).toBe(
      "http://localhost:3000/?auth=google-success"
    );
    expect(refreshCookie(callback)).toContain("worksync_refresh_token=");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: googleEmail }
    });
    expect(user.passwordHash).toBeNull();
    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.GOOGLE,
          providerSubject: googleProfile.subject
        }
      }
    });
    expect(identity.userId).toBe(user.id);

    googleProfile = useGoogleProfile({
      ...googleProfile,
      email: `google-renamed-${Date.now()}@gmail.com`
    });
    const repeatedStart = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const repeatedTransaction = googleTransaction(repeatedStart);
    await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "code-2", state: repeatedTransaction.state })
      .set("cookie", repeatedTransaction.cookie)
      .expect(303);

    const unchangedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });
    const updatedIdentity = await prisma.authIdentity.findUniqueOrThrow({
      where: { id: identity.id }
    });
    expect(unchangedUser.email).toBe(googleEmail);
    expect(updatedIdentity.providerEmail).toBe(googleProfile.email);
    expect(
      await prisma.authSession.count({ where: { userId: user.id } })
    ).toBe(2);
  });

  it("links an authoritative Google email to an existing password user", async () => {
    const linkEmail = `google-link-${Date.now()}@gmail.com`;
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Password Owner",
        email: linkEmail,
        password: "correct horse battery staple"
      })
      .expect(201);
    const googleProfile = useGoogleProfile({
      subject: `google-link-subject-${Date.now()}`,
      email: linkEmail,
      displayName: "Google Owner"
    });
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "link-code", state: transaction.state })
      .set("cookie", transaction.cookie)
      .expect(303);

    const identity = await prisma.authIdentity.findUniqueOrThrow({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.GOOGLE,
          providerSubject: googleProfile.subject
        }
      }
    });
    expect(identity.userId).toBe(signup.body.data.user.id);
    expect(await prisma.user.count({ where: { email: linkEmail } })).toBe(1);
  });

  it("rejects unsafe linking for a third-party Google email", async () => {
    const conflictEmail = `google-conflict-${Date.now()}@example.com`;
    const signup = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Existing User",
        email: conflictEmail,
        password: "correct horse battery staple"
      })
      .expect(201);
    const googleProfile = useGoogleProfile({
      subject: `google-conflict-subject-${Date.now()}`,
      email: conflictEmail,
      displayName: "Conflicting Google User"
    });
    const start = await request(app.getHttpServer())
      .get("/api/auth/google")
      .expect(302);
    const transaction = googleTransaction(start);
    const callback = await request(app.getHttpServer())
      .get("/api/auth/google/callback")
      .query({ code: "conflict-code", state: transaction.state })
      .set("cookie", transaction.cookie)
      .expect(303);

    expect(callback.headers.location).toBe(
      "http://localhost:3000/?auth=google-error&code=GOOGLE_LOGIN_FAILED"
    );
    expect(
      await prisma.authIdentity.count({
        where: { providerSubject: googleProfile.subject }
      })
    ).toBe(0);
    expect(
      await prisma.authSession.count({
        where: { userId: signup.body.data.user.id as string }
      })
    ).toBe(1);
  });

  it("rolls back user and identity creation when session issuance fails", async () => {
    const rollbackEmail = `google-rollback-${Date.now()}@gmail.com`;
    const createSession = jest
      .spyOn(sessions, "create")
      .mockRejectedValueOnce(new Error("session write failed"));

    await expect(
      googleIdentities.authenticate(
        {
          subject: `google-rollback-subject-${Date.now()}`,
          email: rollbackEmail,
          displayName: "Rollback User"
        },
        "integration-test"
      )
    ).rejects.toThrow("session write failed");
    createSession.mockRestore();

    expect(
      await prisma.user.findUnique({ where: { email: rollbackEmail } })
    ).toBeNull();
    expect(
      await prisma.authIdentity.count({
        where: { providerEmail: rollbackEmail }
      })
    ).toBe(0);
  });

  it("resolves a concurrent Google identity race without duplicate users", async () => {
    const raceProfile = {
      subject: `google-race-subject-${Date.now()}`,
      email: `google-race-${Date.now()}@gmail.com`,
      displayName: "Race User"
    };
    const results = await Promise.all([
      googleIdentities.authenticate(raceProfile, "race-a"),
      googleIdentities.authenticate(raceProfile, "race-b")
    ]);

    expect(results).toHaveLength(2);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: raceProfile.email }
    });
    expect(await prisma.user.count({ where: { email: raceProfile.email } })).toBe(
      1
    );
    expect(
      await prisma.authIdentity.count({
        where: {
          provider: AuthProvider.GOOGLE,
          providerSubject: raceProfile.subject
        }
      })
    ).toBe(1);
    expect(
      await prisma.authSession.count({ where: { userId: user.id } })
    ).toBe(2);
  });
});
