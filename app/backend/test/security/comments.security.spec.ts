import type { INestApplication } from "@nestjs/common";
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

describe("comment security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let outsiderToken: string;
  let ownerId: string;
  let outsiderId: string;
  let workspaceId: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    const owner = await signUp(
      app,
      "comment-security-owner@example.com",
      "Security Owner"
    );
    const outsider = await signUp(
      app,
      "comment-security-outsider@example.com",
      "Security Outsider"
    );
    ownerToken = owner.accessToken;
    outsiderToken = outsider.accessToken;
    ownerId = owner.userId;
    outsiderId = outsider.userId;
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Comment Security Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Comment Security Project", key: "CSEC" })
      .expect(201);
    projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Protected discussion" })
      .expect(201);
    taskId = task.body.data.task.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication at both comment boundaries", async () => {
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .expect(401);
    await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .send({ body: "Unauthorized", mentions: [] })
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/mention-candidates`)
      .query({ search: "Sec" })
      .expect(401);
  });

  it("hides tenant resources before resolving project or task identifiers", async () => {
    for (const response of [
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${outsiderToken}`),
      await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${outsiderToken}`)
        .send({ body: "Cross-tenant", mentions: [] })
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.data.code).toBe("RESOURCE_NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toContain(taskId);
    }
  });

  it("rejects self and nonmember mentions with one generic response", async () => {
    for (const mention of [
      { userId: ownerId, label: "Security Owner" },
      { userId: outsiderId, label: "Security Outsider" }
    ]) {
      const body = `Ask @${mention.label}`;
      const start = body.indexOf("@");
      const response = await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .send({
          body,
          mentions: [
            {
              userId: mention.userId,
              start,
              end: body.length
            }
          ]
        })
        .expect(400);
      expect(response.body.data).toEqual(expect.objectContaining({
        code: "VALIDATION_ERROR"
      }));
      expect(JSON.stringify(response.body)).not.toContain(mention.userId);
    }
  });
});
