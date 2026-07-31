import type { INestApplication } from "@nestjs/common";
import request = require("supertest");

import {
  createAuthTestApp,
  type AuthTestContext
} from "../helpers/auth-test-app";

async function signUp(
  app: INestApplication,
  email: string
): Promise<{ accessToken: string; userId: string }> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/signup")
    .send({
      displayName: email.split("@")[0],
      email,
      password: "correct horse battery staple"
    })
    .expect(201);
  return {
    accessToken: response.body.data.accessToken as string,
    userId: response.body.data.user.id as string
  };
}

describe("task security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let outsiderId: string;
  let workspaceId: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    const owner = await signUp(app, "task-security-owner@example.com");
    const viewer = await signUp(app, "task-security-viewer@example.com");
    const outsider = await signUp(app, "task-security-outsider@example.com");
    ownerToken = owner.accessToken;
    viewerToken = viewer.accessToken;
    outsiderToken = outsider.accessToken;
    outsiderId = outsider.userId;
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Task Security Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ email: "task-security-viewer@example.com", role: "VIEWER" })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Task Security Project", key: "TSEC" })
      .expect(201);
    projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Protected task" })
      .expect(201);
    taskId = task.body.data.task.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication on every task boundary", async () => {
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .expect(401);
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
      )
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .send({ title: "Unauthorized" })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/task-assignees`)
      .expect(401);
  });

  it("allows viewers to read and search but rejects every mutation", async () => {
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
      )
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/task-assignees`)
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);

    for (const response of [
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
        .set("authorization", `Bearer ${viewerToken}`)
        .send({ title: "Viewer create" }),
      await request(app.getHttpServer())
        .patch(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
        )
        .set("authorization", `Bearer ${viewerToken}`)
        .send({ title: "Viewer update" }),
      await request(app.getHttpServer())
        .patch(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/status`
        )
        .set("authorization", `Bearer ${viewerToken}`)
        .send({ status: "IN_PROGRESS" })
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.data.code).toBe("AUTHORIZATION_DENIED");
    }
  });

  it("hides workspace, project, task, and assignee identifiers from outsiders", async () => {
    for (const response of [
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
        .set("authorization", `Bearer ${outsiderToken}`),
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
        )
        .set("authorization", `Bearer ${outsiderToken}`),
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/task-assignees`)
        .set("authorization", `Bearer ${outsiderToken}`),
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ title: "Bad assignment", assigneeId: outsiderId })
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.data.code).toBe("RESOURCE_NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toContain(taskId);
      expect(JSON.stringify(response.body)).not.toContain(outsiderId);
    }
  });
});
