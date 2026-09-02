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

describe("notification security controls", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let recipientToken: string;
  let recipientId: string;
  let workspaceId: string;
  let membershipId: string;
  let notificationId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    const owner = await signUp(
      app,
      "notification-security-owner@example.com",
      "Notification Security Owner"
    );
    const recipient = await signUp(
      app,
      "notification-security-recipient@example.com",
      "Notification Security Recipient"
    );
    ownerToken = owner.accessToken;
    recipientToken = recipient.accessToken;
    recipientId = recipient.userId;
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Notification Security Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    const membership = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: "notification-security-recipient@example.com",
        role: "MEMBER"
      })
      .expect(201);
    membershipId = membership.body.data.member.id as string;
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Notification Security Project", key: "NSEC" })
      .expect(201);
    const projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Protected notification" })
      .expect(201);
    const taskId = task.body.data.task.id as string;
    const body = "Private body @Notification Security Recipient";
    const start = body.indexOf("@");
    await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        body,
        mentions: [{ userId: recipientId, start, end: body.length }]
      })
      .expect(201);
    notificationId = [...context.notifications.values()][0]!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication for list and both mutation boundaries", async () => {
    await request(app.getHttpServer()).get("/api/notifications").expect(401);
    await request(app.getHttpServer())
      .patch(`/api/notifications/${notificationId}/read`)
      .expect(401);
    await request(app.getHttpServer())
      .patch("/api/notifications/read-all")
      .expect(401);
  });

  it("does not expose notification content or identifiers to the actor", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/notifications")
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.data).toEqual({
      items: [],
      nextCursor: null,
      unreadCount: 0
    });

    const hidden = await request(app.getHttpServer())
      .patch(`/api/notifications/${notificationId}/read`)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(404);
    expect(JSON.stringify(hidden.body)).not.toContain(notificationId);
    expect(JSON.stringify(hidden.body)).not.toContain("Private body");
  });

  it("removes recipient notifications atomically with workspace membership", async () => {
    await request(app.getHttpServer())
      .delete(`/api/workspaces/${workspaceId}/members/${membershipId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(context.notifications.size).toBe(0);
    const list = await request(app.getHttpServer())
      .get("/api/notifications")
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);
    expect(list.body.data).toEqual({
      items: [],
      nextCursor: null,
      unreadCount: 0
    });
    await request(app.getHttpServer())
      .patch(`/api/notifications/${notificationId}/read`)
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(404);
  });
});
