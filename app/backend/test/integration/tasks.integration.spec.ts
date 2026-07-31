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
