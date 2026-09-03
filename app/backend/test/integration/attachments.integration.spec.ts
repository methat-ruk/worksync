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

function pngBytes(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(label)
  ]);
}

describe("task attachment PostgreSQL and MinIO integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let workspaceId: string;
  let projectId: string;
  let taskId: string;
  let attachmentId: string;
  let ownerUserId: string;
  const runId = `${Date.now()}`;
  const prefix = `attachment-${runId}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
      "Attachment Owner"
    );
    const member = await signUp(
      app,
      `${prefix}-member@example.com`,
      "Attachment Member"
    );
    const viewer = await signUp(
      app,
      `${prefix}-viewer@example.com`,
      "Attachment Viewer"
    );
    const outsider = await signUp(
      app,
      `${prefix}-outsider@example.com`,
      "Attachment Outsider"
    );
    ownerToken = owner.accessToken;
    ownerUserId = owner.userId;
    memberToken = member.accessToken;
    viewerToken = viewer.accessToken;
    outsiderToken = outsider.accessToken;

    const workspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: `${prefix} workspace` })
      .expect(201);
    workspaceId = workspace.body.data.workspace.id as string;
    for (const membership of [
      { email: `${prefix}-member@example.com`, role: "MEMBER" },
      { email: `${prefix}-viewer@example.com`, role: "VIEWER" }
    ]) {
      await request(app.getHttpServer())
        .post(`/api/workspaces/${workspaceId}/members`)
        .set("authorization", `Bearer ${ownerToken}`)
        .send(membership)
        .expect(201);
    }
    const project = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Attachment Project", key: `ATT${runId.slice(-5)}` })
      .expect(201);
    projectId = project.body.data.project.id as string;
    const task = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Attachment task" })
      .expect(201);
    taskId = task.body.data.task.id as string;
  });

  afterAll(async () => {
    await prisma.attachment.deleteMany({
      where: { task: { project: { workspaceId } } }
    });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: prefix } }
    });
    await app.close();
  });

  it("uploads, idempotently replays, lists, and streams forced download", async () => {
    const bytes = pngBytes("authorized-object");
    const path = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;
    const uploaded = await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-upload`)
      .set("x-upload-length", String(bytes.length))
      .attach("file", bytes, { filename: "evidence.png", contentType: "image/png" })
      .expect(201);
    attachmentId = uploaded.body.data.attachment.id as string;
    expect(uploaded.body.data.attachment).toMatchObject({
      filename: "evidence.png",
      size: bytes.length,
      contentType: "image/png",
      status: "AVAILABLE",
      creator: { displayName: "Attachment Owner" }
    });
    expect(uploaded.body.data.attachment).not.toHaveProperty("objectKey");
    expect(uploaded.body.data.attachment).not.toHaveProperty("idempotencyKey");

    const replay = await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-upload`)
      .set("x-upload-length", String(bytes.length))
      .attach("file", bytes, { filename: "evidence.png", contentType: "image/png" })
      .expect(200);
    expect(replay.body.data.attachment.id).toBe(attachmentId);

    const listed = await request(app.getHttpServer())
      .get(path)
      .set("authorization", `Bearer ${viewerToken}`)
      .expect(200);
    expect(listed.body.data.items).toHaveLength(1);
    expect(listed.body.data.items[0].id).toBe(attachmentId);

    const downloaded = await request(app.getHttpServer())
      .get(`${path}/${attachmentId}/content`)
      .set("authorization", `Bearer ${viewerToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(downloaded.body).toEqual(bytes);
    expect(downloaded.headers["content-type"]).toBe("application/octet-stream");
    expect(downloaded.headers["content-disposition"]).toContain("attachment;");
    expect(downloaded.headers["x-content-type-options"]).toBe("nosniff");
    expect(downloaded.headers["cache-control"]).toBe("private, no-store");
  });

  it("enforces current role and workspace authorization", async () => {
    const path = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;
    const bytes = pngBytes("viewer-cannot-upload");
    await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${viewerToken}`)
      .set("idempotency-key", `${prefix}-viewer`)
      .set("x-upload-length", String(bytes.length))
      .attach("file", bytes, { filename: "viewer.png", contentType: "image/png" })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${path}/${attachmentId}`)
      .set("authorization", `Bearer ${memberToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .set("authorization", `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it("rejects mismatched content before availability", async () => {
    const path = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;
    const bytes = Buffer.from("not-a-png");
    await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-invalid`)
      .set("x-upload-length", String(bytes.length))
      .attach("file", bytes, { filename: "invalid.png", contentType: "image/png" })
      .expect(422);
    const listed = await request(app.getHttpServer())
      .get(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(listed.body.data.items.map(({ id }: { id: string }) => id)).toEqual([
      attachmentId
    ]);
  });

  it("deletes object bytes before metadata and denies later download", async () => {
    const path = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;
    await request(app.getHttpServer())
      .delete(`${path}/${attachmentId}`)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`${path}/${attachmentId}/content`)
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(404);
  });

  it("rejects malformed requests and reserves task quota transactionally", async () => {
    const path = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;
    await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-oversize`)
      .set("x-upload-length", String(10 * 1024 * 1024 + 1))
      .expect(413);
    await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-missing-file`)
      .set("x-upload-length", "10")
      .type("form")
      .send({ ignored: "field" })
      .expect(422);

    await prisma.attachment.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        taskId,
        creatorId: ownerUserId,
        displayFilename: `quota-${index}.png`,
        objectKey: `quota-test/${runId}/${index}`,
        declaredContentType: "image/png",
        detectedContentType: "image/png",
        declaredSize: 8n,
        authoritativeSize: 8n,
        sha256: "0".repeat(64),
        status: "AVAILABLE" as const,
        idempotencyKey: `${prefix}-quota-${index}`,
        requestFingerprint: `${index}`.padStart(64, "0")
      }))
    });
    const bytes = pngBytes("quota-rejected");
    const rejected = await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-quota-overflow`)
      .set("x-upload-length", String(bytes.length))
      .attach("file", bytes, { filename: "quota.png", contentType: "image/png" })
      .expect(409);
    expect(rejected.body.data.code).toBe("ATTACHMENT_QUOTA_EXCEEDED");
    await expect(
      prisma.attachment.count({
        where: {
          taskId,
          status: { in: ["PENDING", "AVAILABLE", "DELETING", "DELETE_FAILED"] }
        }
      })
    ).resolves.toBe(20);
  });
});
