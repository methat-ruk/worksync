import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from "@nestjs/common";

import { API_ERROR_CODE } from "../common/errors/api-error-code";
import { PrismaService } from "../database/prisma.service";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../database/serializable-transaction";
import {
  AttachmentStatus,
  Prisma,
  WorkspaceRole
} from "../generated/prisma/client";
import { WorkspaceAuthorizationService } from "../workspaces/workspace-authorization.service";
import {
  canDeleteAttachment,
  canUploadAttachment
} from "./attachment.policy";
import {
  AttachmentInspectionTransform,
  AttachmentPolicyError,
  MAX_ATTACHMENTS_PER_TASK,
  MAX_PENDING_ATTACHMENTS_PER_ACTOR,
  MAX_PENDING_ATTACHMENTS_PER_WORKSPACE,
  MAX_WORKSPACE_ATTACHMENT_BYTES,
  normalizeAttachmentFilename,
  validateDeclaredAttachmentType
} from "./attachment-policy";
import { AttachmentRateLimiterService } from "./attachment-rate-limiter.service";
import type {
  AttachmentListDataDto,
  ListAttachmentsQueryDto,
  PublicAttachmentDto
} from "./dto/attachment.dto";
import {
  MultipartUploadError,
  type ParsedAttachmentUpload
} from "./multipart-upload";
import { S3StorageService } from "./storage/s3-storage.service";

const OBJECT_BEARING_STATUSES = [
  AttachmentStatus.PENDING,
  AttachmentStatus.AVAILABLE,
  AttachmentStatus.DELETING,
  AttachmentStatus.DELETE_FAILED
] as const;

const PUBLIC_ATTACHMENT_SELECT = {
  id: true,
  displayFilename: true,
  authoritativeSize: true,
  detectedContentType: true,
  status: true,
  creatorId: true,
  creator: { select: { id: true, displayName: true } },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AttachmentSelect;

type PublicAttachmentRecord = Prisma.AttachmentGetPayload<{
  select: typeof PUBLIC_ATTACHMENT_SELECT;
}>;

type AttachmentCursor = Readonly<{
  v: 1;
  createdAt: string;
  id: string;
}>;

type ReservedUpload = Readonly<{
  id: string;
  objectKey: string;
  replay?: PublicAttachmentRecord;
}>;

export type UploadAttachmentResult = Readonly<{
  attachment: PublicAttachmentDto;
  replayed: boolean;
}>;

export type AttachmentDownload = Readonly<{
  body: Readable;
  filename: string;
  size: number;
}>;

function resourceNotFound(): NotFoundException {
  return new NotFoundException({
    message: "Attachment not found",
    code: API_ERROR_CODE.RESOURCE_NOT_FOUND
  });
}

function uploadForbidden(): ForbiddenException {
  return new ForbiddenException({
    message: "Not authorized to upload attachments",
    code: API_ERROR_CODE.AUTHORIZATION_DENIED
  });
}

function deleteForbidden(): ForbiddenException {
  return new ForbiddenException({
    message: "Not authorized to delete this attachment",
    code: API_ERROR_CODE.AUTHORIZATION_DENIED
  });
}

function uploadConflict(message: string, inProgress = false): ConflictException {
  return new ConflictException({
    message,
    code: inProgress
      ? API_ERROR_CODE.ATTACHMENT_UPLOAD_IN_PROGRESS
      : API_ERROR_CODE.RESOURCE_CONFLICT
  });
}

function quotaConflict(): ConflictException {
  return new ConflictException({
    message: "Attachment quota has been reached",
    code: API_ERROR_CODE.ATTACHMENT_QUOTA_EXCEEDED
  });
}

function storageUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    message: "Attachment storage is temporarily unavailable",
    code: API_ERROR_CODE.ATTACHMENT_STORAGE_UNAVAILABLE
  });
}

function encodeCursor(
  attachment: Pick<PublicAttachmentRecord, "createdAt" | "id">
): string {
  const cursor: AttachmentCursor = {
    v: 1,
    createdAt: attachment.createdAt.toISOString(),
    id: attachment.id
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string): AttachmentCursor {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid cursor");
    }
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(",") !== "createdAt,id,v" ||
      record.v !== 1 ||
      typeof record.createdAt !== "string" ||
      typeof record.id !== "string" ||
      record.id.length < 1 ||
      record.id.length > 100
    ) {
      throw new Error("Invalid cursor");
    }
    const createdAt = new Date(record.createdAt);
    if (
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== record.createdAt
    ) {
      throw new Error("Invalid cursor");
    }
    return { v: 1, createdAt: record.createdAt, id: record.id };
  } catch {
    throw new UnprocessableEntityException({
      message: "Attachment cursor is not valid",
      code: API_ERROR_CODE.VALIDATION_ERROR
    });
  }
}

function requestFingerprint(
  filename: string,
  contentType: string,
  declaredSize: number
): string {
  return createHash("sha256")
    .update(JSON.stringify([filename, contentType, declaredSize]))
    .digest("hex");
}

function toPublicAttachment(
  attachment: PublicAttachmentRecord
): PublicAttachmentDto {
  if (
    attachment.authoritativeSize === null ||
    attachment.detectedContentType === null ||
    (attachment.status !== AttachmentStatus.AVAILABLE &&
      attachment.status !== AttachmentStatus.DELETE_FAILED)
  ) {
    throw new Error("Attachment is not publicly representable");
  }
  return {
    id: attachment.id,
    filename: attachment.displayFilename,
    size: Number(attachment.authoritativeSize),
    contentType: attachment.detectedContentType,
    status: attachment.status,
    creator: attachment.creator,
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt
  };
}

function findUploadError(error: unknown): AttachmentPolicyError | MultipartUploadError | undefined {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (
      current instanceof AttachmentPolicyError ||
      current instanceof MultipartUploadError
    ) {
      return current;
    }
    if (!current || typeof current !== "object" || !("cause" in current)) {
      return undefined;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function translateUploadError(error: unknown): Error {
  const uploadError = findUploadError(error);
  if (!uploadError) {
    return storageUnavailable();
  }
  if (
    uploadError.reasonCode === "FILE_TOO_LARGE" ||
    uploadError.reasonCode === "SIZE_MISMATCH"
  ) {
    return new PayloadTooLargeException({
      message: "Attachment exceeds or does not match the declared size",
      code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE
    });
  }
  if (uploadError.reasonCode === "CLIENT_ABORTED") {
    return new UnprocessableEntityException({
      message: "Attachment upload was canceled",
      code: API_ERROR_CODE.ATTACHMENT_CONTENT_REJECTED
    });
  }
  return new UnprocessableEntityException({
    message: "Attachment content is not accepted",
    code: API_ERROR_CODE.ATTACHMENT_CONTENT_REJECTED
  });
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceAuthorization: WorkspaceAuthorizationService,
    private readonly rateLimiter: AttachmentRateLimiterService,
    private readonly storage: S3StorageService
  ) {}

  async upload(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    idempotencyKey: string,
    declaredSize: number,
    upload: ParsedAttachmentUpload
  ): Promise<UploadAttachmentResult> {
    let filename: string;
    let declaredContentType: ReturnType<typeof validateDeclaredAttachmentType>;
    try {
      filename = normalizeAttachmentFilename(upload.filename);
      declaredContentType = validateDeclaredAttachmentType(
        filename,
        upload.contentType
      );
    } catch (error: unknown) {
      upload.abortController.abort();
      upload.stream.resume();
      throw translateUploadError(error);
    }
    const fingerprint = requestFingerprint(
      filename,
      declaredContentType,
      declaredSize
    );

    let reservation: ReservedUpload;
    try {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId
      );
      if (!canUploadAttachment(actor.role)) {
        throw uploadForbidden();
      }
      await this.rateLimiter.consume(actor.userId, actor.workspaceId);
      reservation = await this.reserveUpload({
        userId,
        workspaceId,
        projectId,
        taskId,
        filename,
        declaredContentType,
        declaredSize,
        idempotencyKey,
        fingerprint
      });
    } catch (error: unknown) {
      upload.abortController.abort();
      upload.stream.resume();
      throw error;
    }
    if (reservation.replay) {
      upload.abortController.abort();
      upload.stream.resume();
      return {
        attachment: toPublicAttachment(reservation.replay),
        replayed: true
      };
    }

    const inspection = new AttachmentInspectionTransform(
      declaredContentType,
      declaredSize
    );
    upload.stream.once("error", (error: Error) => inspection.destroy(error));
    upload.stream.pipe(inspection);
    try {
      await Promise.all([
        this.storage.upload(
          reservation.objectKey,
          inspection,
          upload.abortController
        ),
        upload.completed
      ]);
      const inspected = inspection.result();
      const available = await this.prisma.attachment.updateMany({
        where: {
          id: reservation.id,
          status: AttachmentStatus.PENDING,
          requestFingerprint: fingerprint
        },
        data: {
          status: AttachmentStatus.AVAILABLE,
          authoritativeSize: BigInt(inspected.authoritativeSize),
          detectedContentType: inspected.detectedContentType,
          sha256: inspected.sha256,
          failureReasonCode: null,
          lastAttemptAt: new Date()
        }
      });
      if (available.count !== 1) {
        throw storageUnavailable();
      }
    } catch (error: unknown) {
      upload.abortController.abort();
      let cleanupVerified = false;
      try {
        await this.storage.delete(reservation.objectKey);
        const head = await this.storage.head(reservation.objectKey);
        cleanupVerified = !head.exists;
      } catch {
        cleanupVerified = false;
      }
      if (cleanupVerified) {
        const uploadError = findUploadError(error);
        await this.prisma.attachment.updateMany({
          where: { id: reservation.id, status: AttachmentStatus.PENDING },
          data: {
            status: AttachmentStatus.FAILED,
            failureReasonCode: uploadError?.reasonCode ?? "STORAGE_FAILURE",
            lastAttemptAt: new Date()
          }
        });
      }
      throw translateUploadError(error);
    }

    const attachment = await this.prisma.attachment.findUniqueOrThrow({
      where: { id: reservation.id },
      select: PUBLIC_ATTACHMENT_SELECT
    });
    return { attachment: toPublicAttachment(attachment), replayed: false };
  }

  async list(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    query: ListAttachmentsQueryDto
  ): Promise<AttachmentListDataDto> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    return this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      await this.requireTask(transaction, workspaceId, projectId, taskId);
      const canSeeDeleteFailures =
        actor.role === WorkspaceRole.OWNER || actor.role === WorkspaceRole.ADMIN;
      const attachments = await transaction.attachment.findMany({
        where: {
          taskId,
          OR: [
            { status: AttachmentStatus.AVAILABLE },
            {
              status: AttachmentStatus.DELETE_FAILED,
              ...(canSeeDeleteFailures ? {} : { creatorId: actor.userId })
            }
          ],
          ...(cursor
            ? {
                AND: [
                  {
                    OR: [
                      { createdAt: { lt: new Date(cursor.createdAt) } },
                      {
                        createdAt: new Date(cursor.createdAt),
                        id: { lt: cursor.id }
                      }
                    ]
                  }
                ]
              }
            : {})
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: PUBLIC_ATTACHMENT_SELECT
      });
      const page = attachments.slice(0, query.limit);
      const lastAttachment = page[page.length - 1];
      return {
        items: page.map(toPublicAttachment),
        nextCursor:
          attachments.length > query.limit && lastAttachment
            ? encodeCursor(lastAttachment)
            : null
      };
    });
  }

  async download(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    attachmentId: string
  ): Promise<AttachmentDownload> {
    const attachment = await this.prisma.$transaction(async (transaction) => {
      await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      await this.requireTask(transaction, workspaceId, projectId, taskId);
      const record = await transaction.attachment.findFirst({
        where: {
          id: attachmentId,
          taskId,
          status: AttachmentStatus.AVAILABLE
        },
        select: {
          objectKey: true,
          displayFilename: true,
          authoritativeSize: true
        }
      });
      if (!record?.authoritativeSize) {
        throw resourceNotFound();
      }
      return record;
    });

    try {
      const object = await this.storage.get(attachment.objectKey);
      if (
        object.contentLength !== undefined &&
        BigInt(object.contentLength) !== attachment.authoritativeSize
      ) {
        object.body.destroy();
        throw storageUnavailable();
      }
      return {
        body: object.body,
        filename: attachment.displayFilename,
        size: Number(attachment.authoritativeSize)
      };
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw storageUnavailable();
    }
  }

  async delete(
    userId: string,
    workspaceId: string,
    projectId: string,
    taskId: string,
    attachmentId: string
  ): Promise<void> {
    const attachment = await this.prisma.$transaction(async (transaction) => {
      const actor = await this.workspaceAuthorization.requireActor(
        userId,
        workspaceId,
        transaction
      );
      await this.requireTask(transaction, workspaceId, projectId, taskId);
      const record = await transaction.attachment.findFirst({
        where: {
          id: attachmentId,
          taskId,
          status: {
            in: [AttachmentStatus.AVAILABLE, AttachmentStatus.DELETE_FAILED]
          }
        },
        select: { id: true, objectKey: true, creatorId: true, status: true }
      });
      if (!record) {
        throw resourceNotFound();
      }
      if (!canDeleteAttachment(actor.role, actor.userId, record.creatorId)) {
        throw deleteForbidden();
      }
      const updated = await transaction.attachment.updateMany({
        where: { id: record.id, status: record.status },
        data: {
          status: AttachmentStatus.DELETING,
          failureReasonCode: null,
          lastAttemptAt: new Date()
        }
      });
      if (updated.count !== 1) {
        throw uploadConflict("Attachment changed concurrently");
      }
      return record;
    });

    try {
      await this.storage.delete(attachment.objectKey);
    } catch {
      await this.prisma.attachment.updateMany({
        where: { id: attachment.id, status: AttachmentStatus.DELETING },
        data: {
          status: AttachmentStatus.DELETE_FAILED,
          failureReasonCode: "STORAGE_DELETE_FAILED",
          lastAttemptAt: new Date()
        }
      });
      throw storageUnavailable();
    }
    await this.prisma.attachment.deleteMany({
      where: { id: attachment.id, status: AttachmentStatus.DELETING }
    });
  }

  private async reserveUpload(input: {
    userId: string;
    workspaceId: string;
    projectId: string;
    taskId: string;
    filename: string;
    declaredContentType: string;
    declaredSize: number;
    idempotencyKey: string;
    fingerprint: string;
  }): Promise<ReservedUpload> {
    try {
      return await runSerializableTransaction(this.prisma, async (transaction) => {
        const actor = await this.workspaceAuthorization.requireActor(
          input.userId,
          input.workspaceId,
          transaction
        );
        if (!canUploadAttachment(actor.role)) {
          throw uploadForbidden();
        }
        await this.requireTask(
          transaction,
          input.workspaceId,
          input.projectId,
          input.taskId
        );
        const existing = await transaction.attachment.findUnique({
          where: {
            taskId_creatorId_idempotencyKey: {
              taskId: input.taskId,
              creatorId: actor.userId,
              idempotencyKey: input.idempotencyKey
            }
          },
          select: {
            ...PUBLIC_ATTACHMENT_SELECT,
            objectKey: true,
            requestFingerprint: true
          }
        });
        if (existing) {
          if (existing.requestFingerprint !== input.fingerprint) {
            throw uploadConflict("Idempotency key was used for another upload");
          }
          if (existing.status === AttachmentStatus.AVAILABLE) {
            return {
              id: existing.id,
              objectKey: existing.objectKey,
              replay: existing
            };
          }
          if (existing.status === AttachmentStatus.PENDING) {
            throw uploadConflict("Attachment upload is already in progress", true);
          }
          if (existing.status !== AttachmentStatus.FAILED) {
            throw uploadConflict("Attachment cannot be uploaded again");
          }
        }

        const taskAttachmentCount = await transaction.attachment.count({
          where: {
            taskId: input.taskId,
            status: { in: [...OBJECT_BEARING_STATUSES] }
          }
        });
        const actorPendingCount = await transaction.attachment.count({
          where: {
            creatorId: actor.userId,
            status: AttachmentStatus.PENDING
          }
        });
        const workspacePendingCount = await transaction.attachment.count({
          where: {
            task: { project: { workspaceId: input.workspaceId } },
            status: AttachmentStatus.PENDING
          }
        });
        const workspaceBytes = await transaction.attachment.aggregate({
          where: {
            task: { project: { workspaceId: input.workspaceId } },
            status: { in: [...OBJECT_BEARING_STATUSES] }
          },
          _sum: { declaredSize: true }
        });
        if (
          taskAttachmentCount >= MAX_ATTACHMENTS_PER_TASK ||
          actorPendingCount >= MAX_PENDING_ATTACHMENTS_PER_ACTOR ||
          workspacePendingCount >= MAX_PENDING_ATTACHMENTS_PER_WORKSPACE ||
          (workspaceBytes._sum.declaredSize ?? 0n) + BigInt(input.declaredSize) >
            BigInt(MAX_WORKSPACE_ATTACHMENT_BYTES)
        ) {
          throw quotaConflict();
        }

        const objectKey = `attachments/${randomUUID()}`;
        if (existing) {
          const reset = await transaction.attachment.update({
            where: { id: existing.id },
            data: {
              objectKey,
              status: AttachmentStatus.PENDING,
              failureReasonCode: null,
              declaredSize: BigInt(input.declaredSize),
              authoritativeSize: null,
              detectedContentType: null,
              sha256: null,
              lastAttemptAt: new Date()
            },
            select: { id: true, objectKey: true }
          });
          return reset;
        }
        return transaction.attachment.create({
          data: {
            taskId: input.taskId,
            creatorId: actor.userId,
            displayFilename: input.filename,
            objectKey,
            declaredContentType: input.declaredContentType,
            declaredSize: BigInt(input.declaredSize),
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.fingerprint
          },
          select: { id: true, objectKey: true }
        });
      });
    } catch (error: unknown) {
      if (error instanceof SerializableTransactionExhaustedError) {
        throw uploadConflict("Attachment changed concurrently; retry the request");
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.attachment.findFirst({
          where: {
            taskId: input.taskId,
            creatorId: input.userId,
            idempotencyKey: input.idempotencyKey
          },
          select: {
            ...PUBLIC_ATTACHMENT_SELECT,
            objectKey: true,
            requestFingerprint: true
          }
        });
        if (existing?.requestFingerprint === input.fingerprint) {
          if (existing.status === AttachmentStatus.AVAILABLE) {
            return {
              id: existing.id,
              objectKey: existing.objectKey,
              replay: existing
            };
          }
          if (existing.status === AttachmentStatus.PENDING) {
            throw uploadConflict(
              "Attachment upload is already in progress",
              true
            );
          }
        }
        throw uploadConflict("Idempotency key was used for another upload");
      }
      throw error;
    }
  }

  private async requireTask(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    projectId: string,
    taskId: string
  ): Promise<void> {
    const task = await transaction.task.findFirst({
      where: {
        id: taskId,
        projectId,
        project: { workspaceId }
      },
      select: { id: true }
    });
    if (!task) {
      throw resourceNotFound();
    }
  }
}
