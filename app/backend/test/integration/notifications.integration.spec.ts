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

describe("notification PostgreSQL integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let recipientToken: string;
  let recipientId: string;
  let workspaceId: string;
  let projectId: string;
  let taskId: string;
  const runId = `${Date.now()}`;
  const prefix = `notification-${runId}`;

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

    const owner = await signUp(
      app,
      `${prefix}-owner@example.com`,
      "Notification Owner"
    );
    const recipient = await signUp(
      app,
      `${prefix}-recipient@example.com`,
      "Notification Recipient"
    );
    ownerToken = owner.accessToken;
    recipientToken = recipient.accessToken;
    recipientId = recipient.userId;

    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: `${prefix} workspace` })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/members`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({
        email: `${prefix}-recipient@example.com`,
        role: "MEMBER"
      })
      .expect(201);
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Notification Integration", key: "NTFI" })
      .expect(201);
    projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Notification pagination" })
      .expect(201);
    taskId = task.body.data.task.id as string;
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

  async function createMentionComment(label: string, occurrences = 1) {
    const mention = "@Notification Recipient";
    const body = `${label} ${Array.from({ length: occurrences }, () => mention).join(" and ")}`;
    const mentions = Array.from({ length: occurrences }, (_, index) => {
      const start = body.indexOf(mention, index === 0 ? 0 : body.indexOf(mention) + 1);
      return {
        userId: recipientId,
        start,
        end: start + mention.length
      };
    });
    const response = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/comments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ body, mentions })
      .expect(201);
    return response.body.data.comment.id as string;
  }

  it("deduplicates recipients and paginates equal timestamps without gaps", async () => {
    const notificationIndexes = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'Notification'
    `;
    expect(notificationIndexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexname: "Notification_recipientId_createdAt_id_idx",
          indexdef: expect.stringContaining('("recipientId", "createdAt", id)')
        }),
        expect.objectContaining({
          indexname: "Notification_recipientId_type_commentId_key"
        }),
        expect.objectContaining({
          indexname: "Notification_commentId_idx"
        })
      ])
    );

    const deduplicatedCommentId = await createMentionComment("Repeated", 2);
    await expect(
      prisma.notification.count({
        where: { commentId: deduplicatedCommentId, recipientId }
      })
    ).resolves.toBe(1);

    const commentIds = [deduplicatedCommentId];
    for (const label of ["Two", "Three", "Four", "Five"]) {
      commentIds.push(await createMentionComment(label));
    }
    const notifications = await prisma.notification.findMany({
      where: { commentId: { in: commentIds }, recipientId },
      select: { id: true }
    });
    const notificationIds = notifications.map(({ id }) => id);
    await prisma.notification.updateMany({
      where: { id: { in: notificationIds } },
      data: { createdAt: new Date("2026-09-02T00:00:00.000Z") }
    });

    const firstPage = await request(app.getHttpServer())
      .get("/api/notifications")
      .query({ limit: 2 })
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);
    const seen: string[] = firstPage.body.data.items.map(
      ({ id }: { id: string }) => id
    );
    let cursor = firstPage.body.data.nextCursor as string | null;

    const newerCommentId = await createMentionComment("Newer after first page");
    const newer = await prisma.notification.findFirstOrThrow({
      where: { commentId: newerCommentId, recipientId },
      select: { id: true }
    });

    while (cursor) {
      const page = await request(app.getHttpServer())
        .get("/api/notifications")
        .query({ limit: 2, cursor })
        .set("authorization", `Bearer ${recipientToken}`)
        .expect(200);
      seen.push(
        ...page.body.data.items.map(({ id }: { id: string }) => id)
      );
      cursor = page.body.data.nextCursor as string | null;
    }

    expect(new Set(seen)).toEqual(new Set(notificationIds));
    expect(seen).toHaveLength(notificationIds.length);
    expect(seen).not.toContain(newer.id);
  });

  it("marks one idempotently and then marks all remaining rows", async () => {
    const unread = await prisma.notification.findFirstOrThrow({
      where: { recipientId, readAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true }
    });
    const [first, repeated] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/notifications/${unread.id}/read`)
        .set("authorization", `Bearer ${recipientToken}`)
        .expect(200),
      request(app.getHttpServer())
        .patch(`/api/notifications/${unread.id}/read`)
        .set("authorization", `Bearer ${recipientToken}`)
        .expect(200)
    ]);
    expect(repeated.body.data.notification.readAt).toBe(
      first.body.data.notification.readAt
    );

    const remainingBefore = await prisma.notification.count({
      where: { recipientId, readAt: null }
    });
    const [markAll] = await Promise.all([
      request(app.getHttpServer())
        .patch("/api/notifications/read-all")
        .set("authorization", `Bearer ${recipientToken}`)
        .expect(200),
      createMentionComment("Concurrent arrival")
    ]);
    expect([remainingBefore, remainingBefore + 1]).toContain(
      markAll.body.data.updatedCount
    );
    expect(markAll.body.data.unreadCount).toBe(0);
    const cutoff = new Date(markAll.body.data.readAt as string);
    const unreadAfterRace = await prisma.notification.findMany({
      where: { recipientId, readAt: null },
      select: { createdAt: true }
    });
    expect(
      unreadAfterRace.every(({ createdAt }) => createdAt.getTime() > cutoff.getTime())
    ).toBe(true);

    await request(app.getHttpServer())
      .patch("/api/notifications/read-all")
      .set("authorization", `Bearer ${recipientToken}`)
      .expect(200);
    await expect(
      prisma.notification.count({ where: { recipientId, readAt: null } })
    ).resolves.toBe(0);
  });
});
