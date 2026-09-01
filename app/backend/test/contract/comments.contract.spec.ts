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

describe("comment and mention API contract", () => {
  let context: AuthTestContext;
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let memberId: string;
  let workspaceId: string;
  let projectId: string;
  let taskId: string;

  beforeAll(async () => {
    context = await createAuthTestApp();
    app = context.app;
    const owner = await signUp(
      app,
      "comment-contract-owner@example.com",
      "Comment Owner"
    );
    const member = await signUp(
      app,
      "comment-contract-alice@example.com",
      "Alice   Example"
    );
    const viewer = await signUp(
      app,
      "comment-contract-viewer@example.com",
      "Comment Viewer"
    );
    const outsider = await signUp(
      app,
      "comment-contract-outsider@example.com",
      "Comment Outsider"
    );
    ownerToken = owner.accessToken;
    viewerToken = viewer.accessToken;
    outsiderToken = outsider.accessToken;
    memberId = member.userId;

    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Comment Contract Workspace" })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    for (const memberInput of [
      { email: "comment-contract-alice@example.com", role: "MEMBER" },
      { email: "comment-contract-viewer@example.com", role: "VIEWER" }
    ]) {
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/members`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send(memberInput)
        .expect(201);
    }
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Comment Contract Project", key: "COMMENT" })
      .expect(201);
    projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Discuss this task" })
      .expect(201);
    taskId = task.body.data.task.id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("searches candidates and returns the canonical mention label", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/mention-candidates`)
      .query({ search: "  aLiCe  " })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.data.items).toEqual([
      {
        id: memberId,
        displayName: "Alice   Example",
        mentionLabel: "Alice Example"
      }
    ]);
    expect(JSON.stringify(response.body)).not.toContain(
      "comment-contract-owner@example.com"
    );

    const callerExcluded = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/mention-candidates`)
      .query({ search: "Comment" })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(
      callerExcluded.body.data.items.map(({ id }: { id: string }) => id)
    ).not.toContain(
      [...context.users.values()].find(
        ({ email }) => email === "comment-contract-owner@example.com"
      )?.id
    );

    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/mention-candidates`)
      .query({ search: " " })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/mention-candidates`)
      .query({ search: "Alice", limit: 11 })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(400);
  });

  it("keeps duplicate display names deterministic and distinct by ID", async () => {
    const duplicate = await signUp(
      app,
      "comment-contract-alice-duplicate@example.com",
      "Alice   Example"
    );
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: "comment-contract-alice-duplicate@example.com",
        role: "MEMBER"
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}/mention-candidates`)
      .query({ search: "Alice" })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    const ids = response.body.data.items.map(({ id }: { id: string }) => id);
    expect(ids).toEqual([...ids].sort((left, right) => left.localeCompare(right)));
    expect(ids).toEqual(expect.arrayContaining([memberId, duplicate.userId]));
    expect(
      response.body.data.items.map(
        ({ mentionLabel }: { mentionLabel: string }) => mentionLabel
      )
    ).toEqual(["Alice Example", "Alice Example"]);
  });

  it("creates a plain-text comment and exposes ranges without recipient IDs", async () => {
    const body = "Please ask @Alice Example about this.";
    const start = body.indexOf("@Alice Example");
    const response = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        body,
        mentions: [
          {
            userId: memberId,
            start,
            end: start + "@Alice Example".length
          }
        ]
      })
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      message: "Comment created",
      data: {
        comment: {
          taskId,
          body,
          author: { displayName: "Comment Owner" },
          mentions: [{ start, end: start + "@Alice Example".length }],
          createdAt: expect.any(String)
        }
      }
    });
    expect(response.body.data.comment).not.toHaveProperty("authorId");
    expect(response.body.data.comment.mentions[0]).not.toHaveProperty(
      "userId"
    );
  });

  it("returns chronological pages while the cursor requests older comments", async () => {
    for (const body of ["Second comment", "Third comment"]) {
      await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .send({ body, mentions: [] })
        .expect(201);
    }

    const latest = await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .query({ limit: 2 })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(latest.body.data.items.map(({ body }: { body: string }) => body)).toEqual([
      "Second comment",
      "Third comment"
    ]);
    expect(latest.body.data.nextCursor).toEqual(expect.any(String));

    const older = await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .query({ limit: 2, cursor: latest.body.data.nextCursor })
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(older.body.data.items).toHaveLength(1);
    expect(older.body.data.items[0].body).toContain("@Alice Example");
    expect(older.body.data.nextCursor).toBeNull();
  });

  it("rejects non-canonical bodies and forged mention metadata", async () => {
    for (const input of [
      { body: " padded ", mentions: [] },
      {
        body: "email@example.com",
        mentions: [
          {
            userId: memberId,
            start: 5,
            end: "email@example.com".length
          }
        ]
      },
      {
        body: "@Wrong Label",
        mentions: [{ userId: memberId, start: 0, end: 12 }]
      }
    ]) {
      await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .send(input)
        .expect(400);
    }
  });

  it("rejects stale mention labels after a display-name change", async () => {
    const member = context.users.get(memberId);
    expect(member).toBeDefined();
    context.users.set(memberId, {
      ...member!,
      displayName: "Alice Renamed"
    });
    const body = "Ask @Alice Example";
    await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        body,
        mentions: [
          {
            userId: memberId,
            start: 4,
            end: body.length
          }
        ]
      })
      .expect(400);
    context.users.set(memberId, member!);
  });

  it("allows viewers to read but hides mutations and tenant resources", async () => {
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);
    const denied = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${viewerToken}`)
      .send({ body: "Viewer comment", mentions: [] })
      .expect(403);
    expect(denied.body.data.code).toBe("AUTHORIZATION_DENIED");

    for (const response of [
      await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${outsiderToken}`),
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/mention-candidates`)
        .query({ search: "Alice" })
        .set("authorization", `Bearer ${outsiderToken}`)
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.data.code).toBe("RESOURCE_NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toContain(taskId);
      expect(JSON.stringify(response.body)).not.toContain(memberId);
    }
  });

  it("documents comment and mention routes with public response schemas", () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .addBearerAuth(
          { type: "http", scheme: "bearer" },
          "access-token"
        )
        .build()
    );
    const comments =
      document.paths[
        "/api/workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/comments"
      ];
    const candidates =
      document.paths[
        "/api/workspaces/{workspaceId}/mention-candidates"
      ];

    expect(comments?.get?.responses).toHaveProperty("200");
    expect(comments?.get?.responses).toHaveProperty("400");
    expect(comments?.post?.responses).toHaveProperty("201");
    expect(comments?.post?.responses).toHaveProperty("403");
    expect(comments?.post?.responses).toHaveProperty("409");
    expect(candidates?.get?.responses).toHaveProperty("200");
    expect(document.components?.schemas).toHaveProperty("PublicCommentDto");
    expect(document.components?.schemas).toHaveProperty(
      "MentionCandidateListResponseDto"
    );
  });
});
