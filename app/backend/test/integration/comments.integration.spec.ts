import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { AuthRateLimiterService } from "../../src/auth/services/auth-rate-limit.service";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";
import { NotificationPersistenceService } from "../../src/notifications/notification-persistence.service";

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

describe("comment PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}`;
  const prefix = `comment-${runId}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(AuthRateLimiterService)
      .useValue({ consume: jest.fn(), consumeIp: jest.fn() })
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

  it("persists mention occurrences and keeps readable history after membership removal", async () => {
    const owner = await signUp(
      app,
      `${prefix}-owner@example.com`,
      "Comment Owner"
    );
    const member = await signUp(
      app,
      `${prefix}-member@example.com`,
      "Alice   Example"
    );
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} workspace` })
      .expect(201);
    const workspaceId = workspace.body.data.workspace.id as string;
    const membership = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ email: `${prefix}-member@example.com`, role: "MEMBER" })
      .expect(201);
    const membershipId = membership.body.data.member.id as string;
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Comment Integration", key: "CINT" })
      .expect(201);
    const projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Persistent discussion" })
      .expect(201);
    const taskId = task.body.data.task.id as string;
    const body = "Check with @Alice Example before shipping.";
    const start = body.indexOf("@Alice Example");
    const created = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({
        body,
        mentions: [
          {
            userId: member.userId,
            start,
            end: start + "@Alice Example".length
          }
        ]
      })
      .expect(201);
    const commentId = created.body.data.comment.id as string;

    await expect(
      prisma.commentMention.findMany({ where: { commentId } })
    ).resolves.toEqual([
      expect.objectContaining({
        commentId,
        mentionedUserId: member.userId,
        start,
        end: start + "@Alice Example".length
      })
    ]);
    await expect(
      prisma.notification.findMany({
        where: { commentId, recipientId: member.userId }
      })
    ).resolves.toEqual([
      expect.objectContaining({
        commentId,
        recipientId: member.userId,
        workspaceId,
        type: "COMMENT_MENTION",
        eventVersion: 1,
        readAt: null
      })
    ]);

    const notificationPersistence = app.get(NotificationPersistenceService);
    jest
      .spyOn(notificationPersistence, "createForCommentCreated")
      .mockRejectedValueOnce(new Error("forced notification persistence failure"));
    const rollbackBody = "Rollback @Alice Example";
    await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({
        body: rollbackBody,
        mentions: [
          {
            userId: member.userId,
            start: rollbackBody.indexOf("@Alice Example"),
            end: rollbackBody.length
          }
        ]
      })
      .expect(500);
    await expect(
      prisma.comment.findFirst({ where: { taskId, body: rollbackBody } })
    ).resolves.toBeNull();

    await request(app.getHttpServer())
      .delete(`/api/workspaces/${workspaceId}/members/${membershipId}`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    await expect(
      prisma.notification.count({
        where: { workspaceId, recipientId: member.userId }
      })
    ).resolves.toBe(0);

    const listed = await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(listed.body.data.items).toEqual([
      expect.objectContaining({
        id: commentId,
        body,
        mentions: [{ start, end: start + "@Alice Example".length }]
      })
    ]);

    await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({
        body: "Removed @Alice Example",
        mentions: [
          {
            userId: member.userId,
            start: 8,
            end: 22
          }
        ]
      })
      .expect(400);
    await expect(
      prisma.comment.count({ where: { taskId } })
    ).resolves.toBe(1);

    const raceTarget = await signUp(
      app,
      `${prefix}-race-member@example.com`,
      "Race Target"
    );
    const raceMembership = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ email: `${prefix}-race-member@example.com`, role: "MEMBER" })
      .expect(201);
    const raceBody = "Ask @Race Target";
    const [raceComment, raceRemoval] = await Promise.all([
      request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${owner.accessToken}`)
        .send({
          body: raceBody,
          mentions: [
            {
              userId: raceTarget.userId,
              start: 4,
              end: raceBody.length
            }
          ]
        }),
      request(app.getHttpServer())
        .delete(
          `/api/workspaces/${workspaceId}/members/${raceMembership.body.data.member.id as string}`
        )
        .set("authorization", `Bearer ${owner.accessToken}`)
    ]);
    expect(raceRemoval.status).toBe(200);
    expect([201, 400, 409]).toContain(raceComment.status);
    await expect(
      prisma.notification.count({
        where: { workspaceId, recipientId: raceTarget.userId }
      })
    ).resolves.toBe(0);
    const persistedRaceComment = await prisma.comment.findFirst({
      where: { taskId, body: raceBody },
      include: { mentions: true }
    });
    if (raceComment.status === 201) {
      expect(persistedRaceComment?.mentions).toHaveLength(1);
      expect(persistedRaceComment?.mentions[0]?.mentionedUserId).toBe(
        raceTarget.userId
      );
    } else {
      expect(persistedRaceComment).toBeNull();
    }
  });

  it("paginates an equal-timestamp thread without duplicates", async () => {
    const owner = await signUp(
      app,
      `${prefix}-cursor-owner@example.com`,
      "Cursor Owner"
    );
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: `${prefix} cursor workspace` })
      .expect(201);
    const workspaceId = workspace.body.data.workspace.id as string;
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Cursor Project", key: "CURSOR" })
      .expect(201);
    const projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "Cursor thread" })
      .expect(201);
    const taskId = task.body.data.task.id as string;

    const commentIndexes = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'Comment'
    `;
    expect(commentIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: "Comment_taskId_createdAt_id_idx",
          indexdef: expect.stringContaining(
            '("taskId", "createdAt", id)'
          )
        })
      ])
    );

    const commentIds: string[] = [];
    for (const body of ["One", "Two", "Three", "Four", "Five"]) {
      const response = await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .set("authorization", `Bearer ${owner.accessToken}`)
        .send({ body, mentions: [] })
        .expect(201);
      commentIds.push(response.body.data.comment.id as string);
    }
    await prisma.comment.updateMany({
      where: { id: { in: commentIds } },
      data: { createdAt: new Date("2026-09-01T00:00:00.000Z") }
    });

    const firstPage = await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .query({ limit: 2 })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(firstPage.body.data).not.toHaveProperty("total");
    const seen: string[] = firstPage.body.data.items.map(
      ({ id }: { id: string }) => id
    );
    let cursor = firstPage.body.data.nextCursor as string | null;

    const newer = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${owner.accessToken}`)
      .send({ body: "Newer after first page", mentions: [] })
      .expect(201);
    const newerId = newer.body.data.comment.id as string;

    while (cursor) {
      const response = await request(app.getHttpServer())
        .get(
          `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
        )
        .query({ limit: 2, ...(cursor ? { cursor } : {}) })
        .set("authorization", `Bearer ${owner.accessToken}`)
        .expect(200);
      seen.push(
        ...response.body.data.items.map(({ id }: { id: string }) => id)
      );
      cursor = response.body.data.nextCursor as string | null;
    }

    expect(new Set(seen)).toEqual(new Set(commentIds));
    expect(seen).toHaveLength(commentIds.length);
    expect(seen).not.toContain(newerId);

    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .query({ cursor: "not-a-cursor" })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(400);
    const unsupportedCursor = Buffer.from(
      JSON.stringify({
        v: 2,
        createdAt: "2026-09-01T00:00:00.000Z",
        id: commentIds[0]
      })
    ).toString("base64url");
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .query({ cursor: unsupportedCursor })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(400);
    const emptyCursor = Buffer.from(
      JSON.stringify({
        v: 1,
        createdAt: "2000-01-01T00:00:00.000Z",
        id: "comment-before-history"
      })
    ).toString("base64url");
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .query({ cursor: emptyCursor })
      .set("authorization", `Bearer ${owner.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ items: [], nextCursor: null });
      });
  });

  it("enforces the comment role matrix and tenant hiding in PostgreSQL", async () => {
    const actors = {
      owner: await signUp(
        app,
        `${prefix}-roles-owner@example.com`,
        "Roles Owner"
      ),
      admin: await signUp(
        app,
        `${prefix}-roles-admin@example.com`,
        "Roles Admin"
      ),
      member: await signUp(
        app,
        `${prefix}-roles-member@example.com`,
        "Roles Member"
      ),
      viewer: await signUp(
        app,
        `${prefix}-roles-viewer@example.com`,
        "Roles Viewer"
      ),
      outsider: await signUp(
        app,
        `${prefix}-roles-outsider@example.com`,
        "Roles Outsider"
      )
    };
    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${actors.owner.accessToken}`)
      .send({ name: `${prefix} roles workspace` })
      .expect(201);
    const workspaceId = workspace.body.data.workspace.id as string;
    for (const role of ["ADMIN", "MEMBER", "VIEWER"] as const) {
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/members`)
        .set("authorization", `Bearer ${actors.owner.accessToken}`)
        .send({
          email: `${prefix}-roles-${role.toLowerCase()}@example.com`,
          role
        })
        .expect(201);
    }
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${actors.owner.accessToken}`)
      .send({ name: "Role Matrix", key: "ROLES" })
      .expect(201);
    const projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${actors.owner.accessToken}`)
      .send({ title: "Role-scoped discussion" })
      .expect(201);
    const taskId = task.body.data.task.id as string;
    const commentsPath = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`;

    for (const [role, actor] of Object.entries(actors).filter(
      ([name]) => name !== "outsider"
    )) {
      await request(app.getHttpServer())
        .get(commentsPath)
        .set("authorization", `Bearer ${actor.accessToken}`)
        .expect(200);
      const response = await request(app.getHttpServer())
        .post(commentsPath)
        .set("authorization", `Bearer ${actor.accessToken}`)
        .send({ body: `${role} comment`, mentions: [] });
      expect(response.status).toBe(role === "viewer" ? 403 : 201);
    }

    for (const response of [
      await request(app.getHttpServer())
        .get(commentsPath)
        .set("authorization", `Bearer ${actors.outsider.accessToken}`),
      await request(app.getHttpServer())
        .post(commentsPath)
        .set("authorization", `Bearer ${actors.outsider.accessToken}`)
        .send({ body: "Outsider comment", mentions: [] }),
      await request(app.getHttpServer())
        .get(`/api/workspaces/${workspaceId}/mention-candidates`)
        .query({ search: "Roles" })
        .set("authorization", `Bearer ${actors.outsider.accessToken}`)
    ]) {
      expect(response.status).toBe(404);
      expect(response.body.data.code).toBe("RESOURCE_NOT_FOUND");
      expect(JSON.stringify(response.body)).not.toContain(taskId);
    }
  });
});
