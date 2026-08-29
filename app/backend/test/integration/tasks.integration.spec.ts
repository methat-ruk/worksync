import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { AuthRateLimiterService } from "../../src/auth/services/auth-rate-limit.service";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";

async function signUp(
  app: INestApplication,
  email: string,
  displayName: string
): Promise<{ accessToken: string; userId: string }> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/signup")
    .send({
      displayName,
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string
  };
}

describe("task PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}`;
  const prefix = `task-${runId}`;

  beforeAll(async () => {
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

  it("persists task fields, searches members, filters, and enforces transitions", async () => {
    const owner = await signUp(
      app,
      `${prefix}-owner@example.com`,
      "Task Owner"
    );
    const assignee = await signUp(
      app,
      `${prefix}-alice@example.com`,
      "Alice Mixed Case"
    );
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} workspace` })
      .expect(201);
    const workspaceId = workspace.body.data.workspace.id as string;
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ email: `${prefix}-alice@example.com`, role: "MEMBER" })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Integration Tasks", key: "TASKINT" })
      .expect(201);
    const projectId = project.body.data.project.id as string;

    const candidates = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/task-assignees`)
      .query({ search: "aLiCe" })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(candidates.body.data.items).toEqual([
      {
        id: assignee.userId,
        displayName: "Alice Mixed Case"
      }
    ]);

    const created = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({
        title: "Persist task",
        description: "PostgreSQL evidence",
        assigneeId: assignee.userId,
        dueDate: "2026-08-07T10:00:00.000Z"
      })
      .expect(201);
    const taskId = created.body.data.task.id as string;

    await expect(
      prisma.task.findUniqueOrThrow({ where: { id: taskId } })
    ).resolves.toMatchObject({
      projectId,
      creatorId: owner.userId,
      assigneeId: assignee.userId,
      title: "Persist task",
      description: "PostgreSQL evidence",
      status: "BACKLOG",
      dueDate: new Date("2026-08-07T10:00:00.000Z")
    });

    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .query({ status: "BACKLOG", assigneeId: assignee.userId })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ total: 1 });
        expect(body.data.items[0].id).toBe(taskId);
      });

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "DONE" })
      .expect(409);
    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "CANCELED" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "IN_PROGRESS" })
      .expect(409);
  });

  it("preserves the task read role matrix and tenant hiding in PostgreSQL", async () => {
    const owner = await signUp(
      app,
      `${prefix}-read-owner@example.com`,
      "Read Owner"
    );
    const admin = await signUp(
      app,
      `${prefix}-read-admin@example.com`,
      "Read Admin"
    );
    const member = await signUp(
      app,
      `${prefix}-read-member@example.com`,
      "Read Member"
    );
    const viewer = await signUp(
      app,
      `${prefix}-read-viewer@example.com`,
      "Read Viewer"
    );
    const outsider = await signUp(
      app,
      `${prefix}-read-outsider@example.com`,
      "Read Outsider"
    );

    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} read workspace` })
      .expect(201);
    const workspaceId = workspace.body.data.workspace.id as string;

    for (const actor of [
      { email: `${prefix}-read-admin@example.com`, role: "ADMIN" },
      { email: `${prefix}-read-member@example.com`, role: "MEMBER" },
      { email: `${prefix}-read-viewer@example.com`, role: "VIEWER" }
    ]) {
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/members`)
        .set("authorization", `Bearer ${owner.accessToken}`)
        .send(actor)
        .expect(201);
    }

    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Readable Tasks", key: "READ" })
      .expect(201);
    const projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Visible to every workspace role" })
      .expect(201);
    const taskId = task.body.data.task.id as string;

    for (const accessToken of [
      owner.accessToken,
      admin.accessToken,
      member.accessToken,
      viewer.accessToken
    ]) {
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
        .set("authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.items).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: taskId })])
          );
        });
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
        )
        .set("authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data.task.id).toBe(taskId);
        });
    }

    const otherProject = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Other Tasks", key: "OTHER" })
      .expect(201);
    const otherProjectId = otherProject.body.data.project.id as string;
    const otherTask = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${otherProjectId}/tasks`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Wrong project task" })
      .expect(201);
    const otherTaskId = otherTask.body.data.task.id as string;

    const outsiderWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${outsider.accessToken}`)
      .send({ name: `${prefix} outsider workspace` })
      .expect(201);
    const outsiderWorkspaceId = outsiderWorkspace.body.data.workspace.id as string;
    const outsiderProject = await request(app.getHttpServer())
      .post(`/api/workspaces/${outsiderWorkspaceId}/projects`)
      .set("authorization", `Bearer ${outsider.accessToken}`)
      .send({ name: "Outsider Tasks", key: "OUT" })
      .expect(201);
    const outsiderProjectId = outsiderProject.body.data.project.id as string;

    const hiddenResponses = [
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
        .set("authorization", `Bearer ${outsider.accessToken}`),
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
        )
        .set("authorization", `Bearer ${outsider.accessToken}`),
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${outsiderProjectId}/tasks`
        )
        .set("authorization", `Bearer ${owner.accessToken}`),
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${otherTaskId}`
        )
        .set("authorization", `Bearer ${owner.accessToken}`)
    ];

    for (const response of hiddenResponses) {
      expect(response.status).toBe(404);
      expect(response.body.data.code).toBe("RESOURCE_NOT_FOUND");
    }
    expect(JSON.stringify(hiddenResponses.map(({ body }) => body))).not.toContain(
      outsiderProjectId
    );
    expect(JSON.stringify(hiddenResponses.map(({ body }) => body))).not.toContain(
      otherTaskId
    );
  });

  it("never leaves a removed member assigned during a concurrent assignment", async () => {
    const owner = await signUp(
      app,
      `${prefix}-race-owner@example.com`,
      "Race Owner"
    );
    const member = await signUp(
      app,
      `${prefix}-race-member@example.com`,
      "Race Member"
    );
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} race workspace` })
      .expect(201);
    const workspaceId = workspace.body.data.workspace.id as string;
    const membership = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ email: `${prefix}-race-member@example.com`, role: "MEMBER" })
      .expect(201);
    const memberId = membership.body.data.member.id as string;
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Race Tasks", key: "RACE" })
      .expect(201);
    const projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Race assignment" })
      .expect(201);
    const taskId = task.body.data.task.id as string;

    const [assignment, removal] = await Promise.all([
      request(app.getHttpServer())
        .patch(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
        )
        .set("authorization", `Bearer ${owner.accessToken}`)
        .send({ assigneeId: member.userId }),
      request(app.getHttpServer())
        .delete(`/api/workspaces/${workspaceId}/members/${memberId}`)
        .set("authorization", `Bearer ${owner.accessToken}`)
    ]);
    expect([200, 404, 409]).toContain(assignment.status);
    expect([200, 409]).toContain(removal.status);

    if (removal.status === 409) {
      await request(app.getHttpServer())
        .delete(`/api/workspaces/${workspaceId}/members/${memberId}`)
        .set("authorization", `Bearer ${owner.accessToken}`)
        .expect(200);
    }

    await expect(
      prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: member.userId
          }
        }
      })
    ).resolves.toBeNull();
    await expect(
      prisma.task.findUniqueOrThrow({ where: { id: taskId } })
    ).resolves.toMatchObject({ assigneeId: null });
  });
});
