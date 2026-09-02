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

describe("notification API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let recipientToken: string;
  let outsiderToken: string;
  let recipientId: string;
  let workspaceId: string;
  let projectId: string;
  let taskId: string;
  let firstNotificationId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    const owner = await signUp(
      app,
      "notification-contract-owner@example.com",
      "Notification Owner"
    );
    const recipient = await signUp(
      app,
      "notification-contract-recipient@example.com",
      "Notification Recipient"
    );
    const outsider = await signUp(
      app,
      "notification-contract-outsider@example.com",
      "Notification Outsider"
    );
    ownerToken = owner.accessToken;
    recipientToken = recipient.accessToken;
    outsiderToken = outsider.accessToken;
    recipientId = recipient.userId;

    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Notification Contract Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: "notification-contract-recipient@example.com",
        role: "MEMBER"
      })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Notification Contract Project", key: "NOTIFY" })
      .expect(201);
    projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Review notification contract" })
      .expect(201);
    taskId = task.body.data.task.id as string;
    await createMentionComment("First mention");
    firstNotificationId = [...context.notifications.values()][0]!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createMentionComment(prefix: string): Promise<void> {
    const body = `${prefix} @Notification Recipient`;
    const start = body.indexOf("@");
    await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        body,
        mentions: [
          {
            userId: recipientId,
            start,
            end: body.length
          }
        ]
      })
      .expect(201);
  }

  it("returns a bounded public newest-first list and unread count", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/notifications")
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        items: [
          {
            id: firstNotificationId,
            type: "COMMENT_MENTION",
            createdAt: expect.any(String),
            readAt: null,
            actor: { displayName: "Notification Owner" },
            workspace: {
              id: workspaceId,
              name: "Notification Contract Workspace"
            },
            project: {
              id: projectId,
              key: "NOTIFY",
              name: "Notification Contract Project"
            },
            task: { id: taskId, title: "Review notification contract" }
          }
        ],
        nextCursor: null,
        unreadCount: 1
      }
    });
    for (const protectedField of [
      "recipientId",
      "commentId",
      "eventVersion",
      "First mention"
    ]) {
      expect(JSON.stringify(response.body)).not.toContain(protectedField);
    }
  });

  it("validates cursor, bounds, and unknown query fields", async () => {
    for (const query of [
      { cursor: "not-a-cursor" },
      { limit: 0 },
      { limit: 101 },
      { unsupported: "field" }
    ]) {
      await request(app.getHttpServer())
        .get("/api/notifications")
        .query(query)
        .set("authorization", `Bearer ${recipientToken}`)
        .expect(400);
    }
  });

  it("marks one notification read idempotently without exposing another user", async () => {
    const first = await request(app.getHttpServer())
      .patch(`/api/notifications/${firstNotificationId}/read`)
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);
    expect(first.body.data).toMatchObject({
      notification: {
        id: firstNotificationId,
        readAt: expect.any(String)
      },
      unreadCount: 0
    });

    const repeated = await request(app.getHttpServer())
      .patch(`/api/notifications/${firstNotificationId}/read`)
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);
    expect(repeated.body.data.notification.readAt).toBe(
      first.body.data.notification.readAt
    );

    for (const token of [ownerToken, outsiderToken]) {
      const hidden = await request(app.getHttpServer())
        .patch(`/api/notifications/${firstNotificationId}/read`)
        .set("authorization", `Bearer ${token}`)
        .expect(404);
      expect(hidden.body.data.code).toBe("RESOURCE_NOT_FOUND");
      expect(JSON.stringify(hidden.body)).not.toContain(firstNotificationId);
    }
  });

  it("marks all currently visible notifications read", async () => {
    await createMentionComment("Second mention");
    const response = await request(app.getHttpServer())
      .patch("/api/notifications/read-all")
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      success: true,
      message: "Notifications marked as read",
      data: {
        readAt: expect.any(String),
        updatedCount: 1,
        unreadCount: 0
      }
    });
  });

  it("documents all notification routes and response schemas", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth(
          { type: "http", scheme: "bearer" },
          "access-token"
        )
        .build()
    );
    const list = document.paths["/api/notifications"];
    const markOne =
      document.paths["/api/notifications/{notificationId}/read"];
    const markAll = document.paths["/api/notifications/read-all"];

    expect(list?.get?.responses).toHaveProperty("200");
    expect(list?.get?.responses).toHaveProperty("400");
    expect(list?.get?.responses).toHaveProperty("401");
    expect(markOne?.patch?.responses).toHaveProperty("200");
    expect(markOne?.patch?.responses).toHaveProperty("404");
    expect(markAll?.patch?.responses).toHaveProperty("200");
    expect(markAll?.patch?.responses).toHaveProperty("409");
  });
});
