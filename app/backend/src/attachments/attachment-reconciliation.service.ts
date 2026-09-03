import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { PrismaService } from "../database/prisma.service";
import { AttachmentStatus } from "../generated/prisma/client";
import {
  ATTACHMENT_CONTENT_TYPES,
  AttachmentInspectionTransform,
  AttachmentPolicyError,
  type AttachmentContentType
} from "./attachment-policy";
import { S3StorageService } from "./storage/s3-storage.service";

const PENDING_STALE_MS = 60 * 60 * 1_000;
const FAILED_RETENTION_MS = 24 * 60 * 60 * 1_000;

export type AttachmentReconciliationReport = Readonly<{
  apply: boolean;
  pendingPromotable: number;
  pendingMissing: number;
  pendingInvalid: number;
  pendingStorageFailures: number;
  pendingCleanupFailures: number;
  failedRemovable: number;
  failedStorageFailures: number;
  deleteRetryCandidates: number;
  deleteRetrySucceeded: number;
  deleteRetryFailed: number;
}>;

function contentType(value: string): AttachmentContentType | undefined {
  return ATTACHMENT_CONTENT_TYPES.find((candidate) => candidate === value);
}

@Injectable()
export class AttachmentReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly logger: PinoLogger
  ) {
    this.logger.setContext(AttachmentReconciliationService.name);
  }

  async reconcile(apply: boolean, batchSize = 100): Promise<AttachmentReconciliationReport> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
      throw new Error("Reconciliation batch size must be from 1 to 500");
    }
    const now = Date.now();
    const report = {
      apply,
      pendingPromotable: 0,
      pendingMissing: 0,
      pendingInvalid: 0,
      pendingStorageFailures: 0,
      pendingCleanupFailures: 0,
      failedRemovable: 0,
      failedStorageFailures: 0,
      deleteRetryCandidates: 0,
      deleteRetrySucceeded: 0,
      deleteRetryFailed: 0
    };

    const pending = await this.prisma.attachment.findMany({
      where: {
        status: AttachmentStatus.PENDING,
        lastAttemptAt: { lt: new Date(now - PENDING_STALE_MS) }
      },
      orderBy: [{ lastAttemptAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: {
        id: true,
        objectKey: true,
        declaredContentType: true,
        declaredSize: true
      }
    });
    for (const attachment of pending) {
      let head;
      try {
        head = await this.storage.head(attachment.objectKey);
      } catch {
        report.pendingStorageFailures += 1;
        continue;
      }
      if (!head.exists) {
        report.pendingMissing += 1;
        if (apply) {
          await this.markFailed(attachment.id, "OBJECT_MISSING");
        }
        continue;
      }
      const declaredContentType = contentType(attachment.declaredContentType);
      if (!declaredContentType) {
        report.pendingInvalid += 1;
        if (apply) {
          try {
            await this.storage.delete(attachment.objectKey);
            await this.markFailed(attachment.id, "INVALID_DECLARED_TYPE");
          } catch {
            report.pendingCleanupFailures += 1;
          }
        }
        continue;
      }
      try {
        const object = await this.storage.get(attachment.objectKey);
        const inspection = new AttachmentInspectionTransform(
          declaredContentType,
          Number(attachment.declaredSize)
        );
        await pipeline(
          object.body,
          inspection,
          new Writable({ write: (_chunk, _encoding, callback) => callback() })
        );
        const inspected = inspection.result();
        report.pendingPromotable += 1;
        if (apply) {
          await this.prisma.attachment.updateMany({
            where: { id: attachment.id, status: AttachmentStatus.PENDING },
            data: {
              status: AttachmentStatus.AVAILABLE,
              authoritativeSize: BigInt(inspected.authoritativeSize),
              detectedContentType: inspected.detectedContentType,
              sha256: inspected.sha256,
              failureReasonCode: null,
              lastAttemptAt: new Date()
            }
          });
        }
      } catch (error: unknown) {
        if (!(error instanceof AttachmentPolicyError)) {
          report.pendingStorageFailures += 1;
          continue;
        }
        report.pendingInvalid += 1;
        if (apply) {
          try {
            await this.storage.delete(attachment.objectKey);
            await this.markFailed(attachment.id, "OBJECT_VALIDATION_FAILED");
          } catch {
            report.pendingCleanupFailures += 1;
          }
        }
      }
    }

    const failed = await this.prisma.attachment.findMany({
      where: {
        status: AttachmentStatus.FAILED,
        lastAttemptAt: { lt: new Date(now - FAILED_RETENTION_MS) }
      },
      orderBy: [{ lastAttemptAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true, objectKey: true }
    });
    for (const attachment of failed) {
      let head;
      try {
        head = await this.storage.head(attachment.objectKey);
      } catch {
        report.failedStorageFailures += 1;
        continue;
      }
      if (!head.exists) {
        report.failedRemovable += 1;
        if (apply) {
          await this.prisma.attachment.deleteMany({
            where: { id: attachment.id, status: AttachmentStatus.FAILED }
          });
        }
      }
    }

    const deleteFailed = await this.prisma.attachment.findMany({
      where: {
        OR: [
          { status: AttachmentStatus.DELETE_FAILED },
          {
            status: AttachmentStatus.DELETING,
            lastAttemptAt: { lt: new Date(now - PENDING_STALE_MS) }
          }
        ]
      },
      orderBy: [{ lastAttemptAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { id: true, objectKey: true, status: true }
    });
    for (const attachment of deleteFailed) {
      report.deleteRetryCandidates += 1;
      if (!apply) {
        continue;
      }
      try {
        await this.storage.delete(attachment.objectKey);
        await this.prisma.attachment.deleteMany({
          where: { id: attachment.id, status: attachment.status }
        });
        report.deleteRetrySucceeded += 1;
      } catch {
        report.deleteRetryFailed += 1;
        await this.prisma.attachment.updateMany({
          where: { id: attachment.id, status: attachment.status },
          data: {
            status: AttachmentStatus.DELETE_FAILED,
            failureReasonCode: "STORAGE_DELETE_FAILED",
            lastAttemptAt: new Date()
          }
        });
      }
    }

    this.logger.info(
      {
        logType: "business_event",
        event: "attachment_reconciliation_completed",
        ...report
      },
      "Attachment reconciliation completed"
    );
    return report;
  }

  private async markFailed(id: string, reasonCode: string): Promise<void> {
    await this.prisma.attachment.updateMany({
      where: { id, status: AttachmentStatus.PENDING },
      data: {
        status: AttachmentStatus.FAILED,
        failureReasonCode: reasonCode,
        lastAttemptAt: new Date()
      }
    });
  }
}
