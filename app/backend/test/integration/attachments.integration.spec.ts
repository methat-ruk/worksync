import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");

import { AppModule } from "../../src/app.module";
import { MAX_WORKSPACE_ATTACHMENT_BYTES } from "../../src/attachments/attachment-policy";
import { AttachmentRateLimiterService } from "../../src/attachments/attachment-rate-limiter.service";
import { AttachmentReconciliationService } from "../../src/attachments/attachment-reconciliation.service";
import { AttachmentsService } from "../../src/attachments/attachments.service";
import { MultipartUploadError } from "../../src/attachments/multipart-upload";
import { S3StorageService } from "../../src/attachments/storage/s3-storage.service";
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

function uploadFingerprint(
  filename: string,
  contentType: string,
  declaredSize: number
): string {
  return createHash("sha256")
    .update(JSON.stringify([filename, contentType, declaredSize]))
    .digest("hex");
}

describe("task attachment PostgreSQL and MinIO integration", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let attachments: AttachmentsService;
  let reconciliation: AttachmentReconciliationService;
  let storage: S3StorageService;
  let ownerToken: string;
  let memberToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let workspaceId: string;
  let foreignWorkspaceId: string;
  let projectId: string;
  let siblingProjectId: string;
  let taskId: string;
  let siblingTaskId: string;
  let quotaTaskId: string;
  let attachmentId: string;
  let ownerUserId: string;
  const runId = `${Date.now()}`;
  const prefix = `attachment-${runId}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRateLimiterService)
      .useValue({ consume: jest.fn(), consumeIp: jest.fn() })
      .overrideProvider(AttachmentRateLimiterService)
      .useValue({ consume: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    prisma = app.get(PrismaService);
    attachments = app.get(AttachmentsService);
    reconciliation = app.get(AttachmentReconciliationService);
    storage = app.get(S3StorageService);

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

    const siblingProject = await request(app.getHttpServer())
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ name: "Attachment Sibling Project", key: `ATS${runId.slice(-5)}` })
      .expect(201);
    siblingProjectId = siblingProject.body.data.project.id as string;
    const siblingTask = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Attachment sibling task" })
      .expect(201);
    siblingTaskId = siblingTask.body.data.task.id as string;
    const quotaTask = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .send({ title: "Attachment quota task" })
      .expect(201);
    quotaTaskId = quotaTask.body.data.task.id as string;

    const foreignWorkspace = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("authorization", `Bearer ${outsiderToken}`)
      .send({ name: `${prefix} foreign workspace` })
      .expect(201);
    foreignWorkspaceId = foreignWorkspace.body.data.workspace.id as string;
  });

  afterAll(async () => {
    const storedObjects = await prisma.attachment.findMany({
      where: {
        task: {
          project: { workspaceId: { in: [workspaceId, foreignWorkspaceId] } }
        }
      },
      select: { objectKey: true }
    });
    await Promise.all(
      storedObjects.map(({ objectKey }) => storage.delete(objectKey))
    );
    await prisma.attachment.deleteMany({
      where: {
        task: {
          project: { workspaceId: { in: [workspaceId, foreignWorkspaceId] } }
        }
      }
    });
    await prisma.workspace.deleteMany({
      where: { id: { in: [workspaceId, foreignWorkspaceId] } }
    });
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

  it("binds attachment access to the exact workspace, project, and task", async () => {
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${taskId}/attachments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments/${attachmentId}/content`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(
        `/api/workspaces/${foreignWorkspaceId}/projects/${projectId}/tasks/${taskId}/attachments`
      )
      .set("authorization", `Bearer ${outsiderToken}`)
      .expect(404);
  });

  it("rejects client-selected object keys at the multipart boundary", async () => {
    const bytes = pngBytes("forged-object-key");
    const response = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-forged-key`)
      .set("x-upload-length", String(bytes.length))
      .field("objectKey", "attachments/attacker-selected")
      .attach("file", bytes, { filename: "forged.png", contentType: "image/png" })
      .expect(422);
    expect(JSON.stringify(response.body)).not.toContain("attacker-selected");
    await expect(
      prisma.attachment.count({
        where: { objectKey: "attachments/attacker-selected" }
      })
    ).resolves.toBe(0);
  });

  it("rejects mismatched and in-progress idempotent replays", async () => {
    const path = `/api/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}/attachments`;
    const mismatchBytes = pngBytes("different-request");
    const mismatch = await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-upload`)
      .set("x-upload-length", String(mismatchBytes.length))
      .attach("file", mismatchBytes, {
        filename: "different.png",
        contentType: "image/png"
      })
      .expect(409);
    expect(mismatch.body.data.code).toBe("RESOURCE_CONFLICT");

    const pendingBytes = pngBytes("in-progress");
    const pendingKey = `${prefix}-in-progress`;
    const pending = await prisma.attachment.create({
      data: {
        taskId,
        creatorId: ownerUserId,
        displayFilename: "in-progress.png",
        objectKey: `attachments/${prefix}-in-progress`,
        declaredContentType: "image/png",
        declaredSize: BigInt(pendingBytes.length),
        idempotencyKey: pendingKey,
        requestFingerprint: uploadFingerprint(
          "in-progress.png",
          "image/png",
          pendingBytes.length
        )
      }
    });
    const inProgress = await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", pendingKey)
      .set("x-upload-length", String(pendingBytes.length))
      .attach("file", pendingBytes, {
        filename: "in-progress.png",
        contentType: "image/png"
      })
      .expect(409);
    expect(inProgress.body.data.code).toBe("ATTACHMENT_UPLOAD_IN_PROGRESS");
    await prisma.attachment.delete({ where: { id: pending.id } });
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

  it("enforces workspace bytes independently from per-task count", async () => {
    const quotaRecord = await prisma.attachment.create({
      data: {
        taskId: quotaTaskId,
        creatorId: ownerUserId,
        displayFilename: "workspace-capacity.png",
        objectKey: `quota-test/${runId}/workspace-capacity`,
        declaredContentType: "image/png",
        detectedContentType: "image/png",
        declaredSize: BigInt(MAX_WORKSPACE_ATTACHMENT_BYTES),
        authoritativeSize: BigInt(MAX_WORKSPACE_ATTACHMENT_BYTES),
        sha256: "1".repeat(64),
        status: "AVAILABLE",
        idempotencyKey: `${prefix}-workspace-capacity`,
        requestFingerprint: "2".repeat(64)
      }
    });
    try {
      const bytes = pngBytes("workspace-byte-overflow");
      const rejected = await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .set("idempotency-key", `${prefix}-workspace-overflow`)
        .set("x-upload-length", String(bytes.length))
        .attach("file", bytes, {
          filename: "workspace-overflow.png",
          contentType: "image/png"
        })
        .expect(409);
      expect(rejected.body.data.code).toBe("ATTACHMENT_QUOTA_EXCEEDED");
    } finally {
      await prisma.attachment.delete({ where: { id: quotaRecord.id } });
    }
  });

  it("serializes concurrent reservations at the task quota boundary", async () => {
    await prisma.attachment.createMany({
      data: Array.from({ length: 19 }, (_, index) => ({
        taskId: quotaTaskId,
        creatorId: ownerUserId,
        displayFilename: `concurrent-quota-${index}.png`,
        objectKey: `quota-test/${runId}/concurrent-${index}`,
        declaredContentType: "image/png",
        detectedContentType: "image/png",
        declaredSize: 8n,
        authoritativeSize: 8n,
        sha256: "3".repeat(64),
        status: "AVAILABLE" as const,
        idempotencyKey: `${prefix}-concurrent-existing-${index}`,
        requestFingerprint: `${index + 100}`.padStart(64, "0")
      }))
    });
    const bytes = pngBytes("concurrent-reservation");
    const path = `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${quotaTaskId}/attachments`;
    try {
      const responses = await Promise.all(
        ["left", "right"].map((suffix) =>
          request(app.getHttpServer())
            .post(path)
            .set("authorization", `Bearer ${ownerToken}`)
            .set("idempotency-key", `${prefix}-concurrent-${suffix}`)
            .set("x-upload-length", String(bytes.length))
            .attach("file", bytes, {
              filename: `${suffix}.png`,
              contentType: "image/png"
            })
        )
      );
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(
        responses.find(({ status }) => status === 409)?.body.data.code
      ).toBe("ATTACHMENT_QUOTA_EXCEEDED");
      await expect(
        prisma.attachment.count({
          where: {
            taskId: quotaTaskId,
            status: { in: ["PENDING", "AVAILABLE", "DELETING", "DELETE_FAILED"] }
          }
        })
      ).resolves.toBe(20);
    } finally {
      const records = await prisma.attachment.findMany({
        where: { taskId: quotaTaskId },
        select: { objectKey: true }
      });
      await Promise.all(
        records.map(({ objectKey }) => storage.delete(objectKey))
      );
      await prisma.attachment.deleteMany({ where: { taskId: quotaTaskId } });
    }
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

  it("rejects streamed bytes above the declared size and cleans the object", async () => {
    const bytes = pngBytes("larger-than-declared");
    const idempotencyKey = `${prefix}-stream-oversize`;
    const response = await request(app.getHttpServer())
      .post(
        `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments`
      )
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", idempotencyKey)
      .set("x-upload-length", "8")
      .attach("file", bytes, { filename: "oversize.png", contentType: "image/png" })
      .expect(413);
    expect(response.body.data.code).toBe("ATTACHMENT_TOO_LARGE");
    const failed = await prisma.attachment.findFirstOrThrow({
      where: { taskId: siblingTaskId, idempotencyKey },
      select: { objectKey: true, status: true, failureReasonCode: true }
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      failureReasonCode: "SIZE_MISMATCH"
    });
    await expect(storage.head(failed.objectKey)).resolves.toEqual({ exists: false });
  });

  it("keeps metadata pending while storage is slow, then completes", async () => {
    const bytes = pngBytes("slow-storage");
    const idempotencyKey = `${prefix}-slow-storage`;
    const originalUpload = storage.upload.bind(storage);
    let releaseStorage: () => void = () => undefined;
    const storageReleased = new Promise<void>((resolve) => {
      releaseStorage = resolve;
    });
    let signalStorageStarted!: () => void;
    const storageStarted = new Promise<void>((resolve) => {
      signalStorageStarted = resolve;
    });
    const uploadSpy = jest
      .spyOn(storage, "upload")
      .mockImplementationOnce(async (objectKey, body, abortController) => {
        signalStorageStarted();
        await storageReleased;
        await originalUpload(objectKey, body, abortController);
      });
    const responsePromise = Promise.resolve(
      request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .set("idempotency-key", idempotencyKey)
        .set("x-upload-length", String(bytes.length))
        .attach("file", bytes, {
          filename: "slow-storage.png",
          contentType: "image/png"
        })
    );
    try {
      await storageStarted;
      await expect(
        prisma.attachment.findFirst({
          where: { taskId: siblingTaskId, idempotencyKey },
          select: { status: true }
        })
      ).resolves.toEqual({ status: "PENDING" });
      releaseStorage();
      await expect(responsePromise).resolves.toMatchObject({ status: 201 });
    } finally {
      releaseStorage();
      uploadSpy.mockRestore();
      await Promise.resolve(responsePromise).catch(() => undefined);
    }
  });

  it("records failed metadata and removes bytes after storage failure", async () => {
    const bytes = pngBytes("storage-failure");
    const idempotencyKey = `${prefix}-storage-failure`;
    const uploadSpy = jest
      .spyOn(storage, "upload")
      .mockRejectedValueOnce(new Error("simulated storage failure"));
    try {
      const response = await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .set("idempotency-key", idempotencyKey)
        .set("x-upload-length", String(bytes.length))
        .attach("file", bytes, {
          filename: "storage-failure.png",
          contentType: "image/png"
        })
        .expect(503);
      expect(response.body.data.code).toBe("ATTACHMENT_STORAGE_UNAVAILABLE");
    } finally {
      uploadSpy.mockRestore();
    }
    const failed = await prisma.attachment.findFirstOrThrow({
      where: { taskId: siblingTaskId, idempotencyKey },
      select: { objectKey: true, status: true, failureReasonCode: true }
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      failureReasonCode: "STORAGE_FAILURE"
    });
    await expect(storage.head(failed.objectKey)).resolves.toEqual({ exists: false });
  });

  it.each(["guard", "database"])("cleans storage after a failed availability transition (%s)", async (failure) => {
    const bytes = pngBytes("availability-transition-failure");
    const idempotencyKey = `${prefix}-transition-failure-${failure}`;
    const updateSpy = jest.spyOn(prisma.attachment, "updateMany");
    if (failure === "guard") {
      updateSpy.mockResolvedValueOnce({ count: 0 });
    } else {
      updateSpy.mockRejectedValueOnce(new Error("simulated database failure"));
    }
    try {
      const response = await request(app.getHttpServer())
        .post(
          `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments`
        )
        .set("authorization", `Bearer ${ownerToken}`)
        .set("idempotency-key", idempotencyKey)
        .set("x-upload-length", String(bytes.length))
        .attach("file", bytes, {
          filename: "transition-failure.png",
          contentType: "image/png"
        })
        .expect(503);
      expect(response.body.data.code).toBe("ATTACHMENT_STORAGE_UNAVAILABLE");
    } finally {
      updateSpy.mockRestore();
    }
    const failed = await prisma.attachment.findFirstOrThrow({
      where: { taskId: siblingTaskId, idempotencyKey },
      select: { objectKey: true, status: true, failureReasonCode: true }
    });
    expect(failed).toMatchObject({
      status: "FAILED",
      failureReasonCode: "STORAGE_FAILURE"
    });
    await expect(storage.head(failed.objectKey)).resolves.toEqual({ exists: false });
  });

  it("contains a client-aborted stream as a recoverable failed upload", async () => {
    const idempotencyKey = `${prefix}-client-abort`;
    const filename = "client-abort.png";
    const declaredSize = pngBytes("client-abort").length;
    let rejectCompleted!: (error: Error) => void;
    const completed = new Promise<void>((_resolve, reject) => {
      rejectCompleted = reject;
    });
    void completed.catch(() => undefined);
    let emitted = false;
    const stream = new Readable({
      read() {
        if (emitted) {
          return;
        }
        emitted = true;
        const error = new MultipartUploadError("CLIENT_ABORTED");
        rejectCompleted(error);
        this.destroy(error);
      }
    });

    await expect(
      attachments.upload(
        ownerUserId,
        workspaceId,
        siblingProjectId,
        siblingTaskId,
        idempotencyKey,
        declaredSize,
        {
          filename,
          contentType: "image/png",
          stream,
          completed,
          abortController: new AbortController()
        }
      )
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      prisma.attachment.findFirst({
        where: { taskId: siblingTaskId, idempotencyKey },
        select: { status: true, failureReasonCode: true }
      })
    ).resolves.toEqual({
      status: "FAILED",
      failureReasonCode: "CLIENT_ABORTED"
    });
  });

  it("promotes a verified stale pending object through reconciliation", async () => {
    const bytes = pngBytes("stale-pending");
    const objectKey = `attachments/${prefix}-stale-pending`;
    await storage.upload(objectKey, Readable.from([bytes]), new AbortController());
    const pending = await prisma.attachment.create({
      data: {
        taskId: siblingTaskId,
        creatorId: ownerUserId,
        displayFilename: "stale-pending.png",
        objectKey,
        declaredContentType: "image/png",
        declaredSize: BigInt(bytes.length),
        status: "PENDING",
        idempotencyKey: `${prefix}-stale-pending`,
        requestFingerprint: uploadFingerprint(
          "stale-pending.png",
          "image/png",
          bytes.length
        ),
        lastAttemptAt: new Date(Date.now() - 2 * 60 * 60 * 1_000)
      }
    });

    await expect(reconciliation.reconcile(true, 100)).resolves.toMatchObject({
      pendingPromotable: 1
    });
    await expect(
      prisma.attachment.findUnique({
        where: { id: pending.id },
        select: {
          status: true,
          authoritativeSize: true,
          detectedContentType: true,
          sha256: true
        }
      })
    ).resolves.toMatchObject({
      status: "AVAILABLE",
      authoritativeSize: BigInt(bytes.length),
      detectedContentType: "image/png",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
  });

  it("retains delete failure state and reconciles the retry", async () => {
    const bytes = pngBytes("delete-retry");
    const path = `/api/workspaces/${workspaceId}/projects/${siblingProjectId}/tasks/${siblingTaskId}/attachments`;
    const uploaded = await request(app.getHttpServer())
      .post(path)
      .set("authorization", `Bearer ${ownerToken}`)
      .set("idempotency-key", `${prefix}-delete-retry`)
      .set("x-upload-length", String(bytes.length))
      .attach("file", bytes, {
        filename: "delete-retry.png",
        contentType: "image/png"
      })
      .expect(201);
    const retryAttachmentId = uploaded.body.data.attachment.id as string;
    const stored = await prisma.attachment.findUniqueOrThrow({
      where: { id: retryAttachmentId },
      select: { objectKey: true }
    });
    const deleteSpy = jest
      .spyOn(storage, "delete")
      .mockRejectedValueOnce(new Error("simulated delete failure"));
    try {
      const response = await request(app.getHttpServer())
        .delete(`${path}/${retryAttachmentId}`)
        .set("authorization", `Bearer ${ownerToken}`)
        .expect(503);
      expect(response.body.data.code).toBe("ATTACHMENT_STORAGE_UNAVAILABLE");
    } finally {
      deleteSpy.mockRestore();
    }
    await expect(
      prisma.attachment.findUnique({
        where: { id: retryAttachmentId },
        select: { status: true, failureReasonCode: true }
      })
    ).resolves.toEqual({
      status: "DELETE_FAILED",
      failureReasonCode: "STORAGE_DELETE_FAILED"
    });

    const report = await reconciliation.reconcile(true, 100);
    expect(report.deleteRetryCandidates).toBeGreaterThanOrEqual(1);
    expect(report.deleteRetrySucceeded).toBeGreaterThanOrEqual(1);
    await expect(
      prisma.attachment.findUnique({ where: { id: retryAttachmentId } })
    ).resolves.toBeNull();
    await expect(storage.head(stored.objectKey)).resolves.toEqual({ exists: false });
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
