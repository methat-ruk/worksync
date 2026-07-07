import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { AuthRateLimiterService } from "../../src/auth/services/auth-rate-limit.service";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

type SignedUpUser = {
  accessToken: string;
  userId: string;
};

describeWithDatabase("workspace PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}`;
  const emailPrefix = `workspace-${runId}`;
  const slugPrefix = `integration-workspace-${runId}`;

  async function signUp(email: string): Promise<SignedUpUser> {
    const response = await request(app.getHttpServer())
      .post("/api/auth/signup")
      .send({
        displayName: "Workspace Integration User",
        email,
        password: "correct horse battery staple"
      })
      .expect(201);
    return {
      accessToken: response.body.data.accessToken as string,
      userId: response.body.data.user.id as string
    };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(AuthRateLimiterService)
      .useValue({
        consume: jest.fn(),
        consumeIp: jest.fn()
      })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.workspace.deleteMany({
      where: { slug: { startsWith: slugPrefix } }
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: emailPrefix } }
    });
    await app.close();
  });

  it("creates a workspace and owner membership transactionally", async () => {
    const owner = await signUp(`${emailPrefix}-owner@example.com`);
    const response = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `Integration Workspace ${runId}` })
      .expect(201);

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: response.body.data.workspace.id as string },
      include: { members: true }
    });
    expect(workspace.name).toBe(`Integration Workspace ${runId}`);
    expect(workspace.slug).toBe(slugPrefix);
    expect(workspace.members).toEqual([
      expect.objectContaining({
        userId: owner.userId,
        role: "OWNER"
      })
    ]);
  });

  it("lists only workspaces where the caller has membership", async () => {
    const owner = await signUp(`${emailPrefix}-list-owner@example.com`);
    const outsider = await signUp(`${emailPrefix}-list-outsider@example.com`);
    const ownerWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `Integration Workspace ${runId} Owner` })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${outsider.accessToken}`)
      .send({ name: `Integration Workspace ${runId} Outsider` })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get("/api/workspaces")
      .set("authorization", `Bearer ${outsider.accessToken}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1
    });
    expect(JSON.stringify(response.body)).not.toContain(
      ownerWorkspace.body.data.workspace.id
    );
    expect(response.body.data.items).toEqual([
      expect.objectContaining({
        name: `Integration Workspace ${runId} Outsider`,
        membershipRole: "OWNER"
      })
    ]);
  });

  it("rejects direct cross-user workspace reads with a not-found contract", async () => {
    const owner = await signUp(`${emailPrefix}-read-owner@example.com`);
    const outsider = await signUp(`${emailPrefix}-read-outsider@example.com`);
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `Integration Workspace ${runId} Read` })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/workspaces/${created.body.data.workspace.id as string}`)
      .set("authorization", `Bearer ${outsider.accessToken}`)
      .expect(404);

    expect(response.body).toMatchObject({
      success: false,
      message: "Workspace not found",
      data: {
        code: "RESOURCE_NOT_FOUND",
        correlationId: expect.any(String)
      }
    });
    expect(JSON.stringify(response.body)).not.toContain(
      created.body.data.workspace.slug
    );
  });

  it("manages workspace memberships with persisted role changes", async () => {
    const owner = await signUp(`${emailPrefix}-membership-owner@example.com`);
    const member = await signUp(`${emailPrefix}-membership-member@example.com`);
    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `Integration Workspace ${runId} Members` })
      .expect(201);
    const workspaceId = created.body.data.workspace.id as string;

    const added = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: `${emailPrefix}-membership-member@example.com`,
        role: "MEMBER"
      })
      .expect(201);
    const memberId = added.body.data.member.id as string;

    await expect(
      prisma.workspaceMember.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId, userId: member.userId } }
      })
    ).resolves.toMatchObject({ role: "MEMBER" });

    const list = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(list.body.data).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 2
    });
    expect(list.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: `${emailPrefix}-membership-member@example.com`,
          role: "MEMBER"
        })
      ])
    );

    await request(app.getHttpServer())
      .patch(`/api/workspaces/${workspaceId}/members/${memberId}`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "VIEWER" })
      .expect(200);
    await expect(
      prisma.workspaceMember.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId, userId: member.userId } }
      })
    ).resolves.toMatchObject({ role: "VIEWER" });

    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}`)
      .set("authorization", `Bearer ${member.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/workspaces/${workspaceId}/members/${memberId}`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    await expect(
      prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: member.userId } }
      })
    ).resolves.toBeNull();

    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}`)
      .set("authorization", `Bearer ${member.accessToken}`)
      .expect(404);
  });
});
