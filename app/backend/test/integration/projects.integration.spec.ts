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

async function signUp(
  app: INestApplication,
  email: string
): Promise<{ accessToken: string; userId: string }> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/signup")
    .send({
      displayName: "Project Integration User",
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string
  };
}

describeWithDatabase("project PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}`;
  const prefix = `project-${runId}`;

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
      where: { slug: { startsWith: prefix } }
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: prefix } }
    });
    await app.close();
  });

  it("persists normalized projects, paginates stably, and allows keys per workspace", async () => {
    const owner = await signUp(app, `${prefix}-owner@example.com`);
    const firstWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} first` })
      .expect(201);
    const secondWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} second` })
      .expect(201);
    const firstWorkspaceId = firstWorkspace.body.data.workspace.id as string;
    const secondWorkspaceId = secondWorkspace.body.data.workspace.id as string;

    const first = await request(app.getHttpServer())
      .post(`/api/workspaces/${firstWorkspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "First Project", key: " same " })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/workspaces/${firstWorkspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Duplicate Project", key: "SAME" })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/api/workspaces/${secondWorkspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Same Key Other Workspace", key: "SAME" })
      .expect(201);

    const persisted = await prisma.project.findUniqueOrThrow({
      where: { id: first.body.data.project.id as string }
    });
    expect(persisted).toMatchObject({
      workspaceId: firstWorkspaceId,
      name: "First Project",
      key: "SAME"
    });

    for (const [name, key] of [
      ["Second Project", "SECOND"],
      ["Third Project", "THIRD"]
    ]) {
      await request(app.getHttpServer())
        .post(`/api/workspaces/${firstWorkspaceId}/projects`)
        .set("authorization", `Bearer ${owner.accessToken}`)
        .send({ name, key })
        .expect(201);
    }

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${firstWorkspaceId}/projects/${
          first.body.data.project.id as string
        }`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "First Project Updated" })
      .expect(200);

    const pageOne = await request(app.getHttpServer())
      .get(`/api/workspaces/${firstWorkspaceId}/projects`)
      .query({ page: 1, pageSize: 2 })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    const pageTwo = await request(app.getHttpServer())
      .get(`/api/workspaces/${firstWorkspaceId}/projects`)
      .query({ page: 2, pageSize: 2 })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(pageOne.body.data).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3
    });
    expect(pageTwo.body.data).toMatchObject({
      page: 2,
      pageSize: 2,
      total: 3
    });
    expect(pageOne.body.data.items[0]).toMatchObject({
      id: first.body.data.project.id,
      name: "First Project Updated"
    });
    expect(
      new Set(
        [...pageOne.body.data.items, ...pageTwo.body.data.items].map(
          (project: { id: string }) => project.id
        )
      ).size
    ).toBe(3);
  });

  it("observes current roles and rejects cross-workspace reads and writes", async () => {
    const owner = await signUp(app, `${prefix}-rbac-owner@example.com`);
    const member = await signUp(app, `${prefix}-rbac-member@example.com`);
    const firstWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} rbac first` })
      .expect(201);
    const secondWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} rbac second` })
      .expect(201);
    const firstWorkspaceId = firstWorkspace.body.data.workspace.id as string;
    const secondWorkspaceId = secondWorkspace.body.data.workspace.id as string;
    const membership = await request(app.getHttpServer())
      .post(`/api/workspaces/${firstWorkspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ email: `${prefix}-rbac-member@example.com`, role: "MEMBER" })
      .expect(201);

    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${firstWorkspaceId}/projects`)
      .set("authorization", `Bearer ${member.accessToken}`)
      .send({ name: "Member Project", key: "MEMBER" })
      .expect(201);
    const projectId = project.body.data.project.id as string;

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${firstWorkspaceId}/members/${
          membership.body.data.member.id as string
        }`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "VIEWER" })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${firstWorkspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${member.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/workspaces/${firstWorkspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${member.accessToken}`)
      .send({ name: "Forbidden Viewer Update" })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/workspaces/${secondWorkspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/workspaces/${secondWorkspaceId}/projects/${projectId}`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Cross Workspace Update" })
      .expect(404);

    await expect(
      prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    ).resolves.toMatchObject({ name: "Member Project" });
  });
});
