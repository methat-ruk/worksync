import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

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

describe("task API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let assigneeId: string;
  let workspaceId: string;
  let projectId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    const owner = await signUp(
      app,
      "task-contract-owner@example.com",
      "Task Owner"
    );
    const assignee = await signUp(
      app,
      "task-contract-alice@example.com",
      "Alice Example"
    );
    ownerToken = owner.accessToken;
    assigneeId = assignee.userId;
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Task Contract Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: "task-contract-alice@example.com",
        role: "MEMBER"
      })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Task Contract Project", key: "TASKS" })
      .expect(201);
    projectId = project.body.data.project.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates, lists, reads, updates, and transitions a public task", async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        title: "  Ship task flow  ",
        description: "Contract coverage",
        assigneeId,
        dueDate: "2026-08-07T10:00:00.000Z"
      })
      .expect(201);

    expect(created.body).toMatchObject({
      success: true,
      message: "Task created",
      data: {
        task: {
          title: "Ship task flow",
          description: "Contract coverage",
          status: "BACKLOG",
          dueDate: "2026-08-07T10:00:00.000Z",
          creator: { displayName: "Task Owner" },
          assignee: { id: assigneeId, displayName: "Alice Example" },
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        }
      }
    });
    expect(created.body.data.task).not.toHaveProperty("creatorId");
    expect(created.body.data.task).not.toHaveProperty("assigneeId");
    const taskId = created.body.data.task.id as string;

    const listed = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .query({ status: "BACKLOG", assigneeId })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(listed.body.data).toMatchObject({
      items: [expect.objectContaining({ id: taskId })],
      page: 1,
      pageSize: 20,
      total: 1
    });

    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.task.id).toBe(taskId);
      });

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ description: null, assigneeId: null, dueDate: null })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.task).toMatchObject({
          description: null,
          assignee: null,
          dueDate: null
        });
      });

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ status: "IN_PROGRESS" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ status: "DONE" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ status: "IN_PROGRESS" })
      .expect(200);
  });

  it("searches assignees with a minimal case-insensitive contract", async () => {
    const result = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/task-assignees`)
      .query({ search: "  aLiCe  " })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(result.body.data).toMatchObject({
      items: [{ id: assigneeId, displayName: "Alice Example" }],
      page: 1,
      pageSize: 20,
      total: 1
    });
    expect(result.body.data.items[0]).not.toHaveProperty("email");
    expect(result.body.data.items[0]).not.toHaveProperty("role");
  });

  it("rejects due dates that omit an explicit timezone", async () => {
    const invalidDueDates = ["2026-08-07", "2026-08-07T10:00:00"];

    for (const dueDate of invalidDueDates) {
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ title: "Invalid create due date", dueDate })
        .expect(400);
    }

    const created = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        title: "Due date validation task",
        dueDate: "2026-08-07T10:00:00+07:00"
      })
      .expect(201);
    const taskId = created.body.data.task.id as string;

    for (const dueDate of invalidDueDates) {
      await request(app.getHttpServer())
        .patch(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ dueDate })
        .expect(400);
    }
  });

  it("rejects protected, empty, conflicting, and invalid transition input", async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Validation task", assigneeId })
      .expect(201);
    const taskId = created.body.data.task.id as string;

    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Changed", status: "DONE", creatorId: "someone" })
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .query({ assigneeId, unassigned: true })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(400);
    const falseFilter = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .query({ unassigned: "false" })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      falseFilter.body.data.items.map(
        (item: { id: string }) => item.id
      )
    ).toContain(taskId);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .query({ unassigned: "1" })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(400);

    const invalid = await request(app.getHttpServer())
      .patch(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ status: "DONE" })
      .expect(409);
    expect(invalid.body.data.code).toBe("INVALID_TASK_TRANSITION");
  });

  it("documents all task routes and public schemas", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth(
          { type: "http", scheme: "bearer" },
          "access-token"
        )
        .build()
    );
    const collection =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks"
      ];
    const item =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}"
      ];
    const status =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/status"
      ];
    const assignees =
      document.paths["/api/workspaces/{workspaceId}/task-assignees"];

    expect(collection?.post?.responses).toHaveProperty("201");
    expect(collection?.get?.responses).toHaveProperty("200");
    expect(item?.get?.responses).toHaveProperty("404");
    expect(item?.patch?.responses).toHaveProperty("403");
    expect(status?.patch?.responses).toHaveProperty("409");
    expect(assignees?.get?.responses).toHaveProperty("200");
    expect(document.components?.schemas).toHaveProperty("PublicTaskDto");
    expect(document.components?.schemas).toHaveProperty(
      "TaskAssigneeListResponseDto"
    );
  });
});
