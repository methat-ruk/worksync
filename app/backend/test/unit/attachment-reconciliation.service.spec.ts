import type { PinoLogger } from "nestjs-pino";

import { AttachmentReconciliationService } from "../../src/attachments/attachment-reconciliation.service";
import type { S3StorageService } from "../../src/attachments/storage/s3-storage.service";
import type { PrismaService } from "../../src/database/prisma.service";

function harness() {
  const attachment = {
    findMany: jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: "pending-1",
          objectKey: "private-pending-key",
          declaredContentType: "image/png",
          declaredSize: 8n
        }
      ])
      .mockResolvedValueOnce([
        { id: "failed-1", objectKey: "private-failed-key" }
      ])
      .mockResolvedValueOnce([
        {
          id: "delete-1",
          objectKey: "private-delete-key",
          status: "DELETE_FAILED"
        }
      ]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 })
  };
  const storage = {
    head: jest.fn().mockResolvedValue({ exists: false }),
    delete: jest.fn().mockResolvedValue(undefined)
  };
  const logger = { setContext: jest.fn(), info: jest.fn() };
  const service = new AttachmentReconciliationService(
    { attachment } as unknown as PrismaService,
    storage as unknown as S3StorageService,
    logger as unknown as PinoLogger
  );
  return { attachment, storage, logger, service };
}

describe("AttachmentReconciliationService", () => {
  it("keeps dry-run inspection mutation-free", async () => {
    const { attachment, storage, service } = harness();
    await expect(service.reconcile(false, 10)).resolves.toMatchObject({
      apply: false,
      pendingMissing: 1,
      failedRemovable: 1,
      deleteRetryCandidates: 1,
      deleteRetrySucceeded: 0
    });
    expect(attachment.updateMany).not.toHaveBeenCalled();
    expect(attachment.deleteMany).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("applies verified missing-object and delete recovery actions", async () => {
    const { attachment, storage, service } = harness();
    await expect(service.reconcile(true, 10)).resolves.toMatchObject({
      apply: true,
      pendingMissing: 1,
      failedRemovable: 1,
      deleteRetryCandidates: 1,
      deleteRetrySucceeded: 1
    });
    expect(attachment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pending-1", status: "PENDING" } })
    );
    expect(storage.delete).toHaveBeenCalledWith("private-delete-key");
    expect(attachment.deleteMany).toHaveBeenCalledTimes(2);
  });

  it("contains provider read failures without mutating metadata", async () => {
    const { attachment, storage, service } = harness();
    storage.head.mockRejectedValue(new Error("provider offline"));
    await expect(service.reconcile(false, 10)).resolves.toMatchObject({
      pendingStorageFailures: 1,
      failedStorageFailures: 1,
      pendingMissing: 0,
      failedRemovable: 0
    });
    expect(attachment.updateMany).not.toHaveBeenCalled();
    expect(attachment.deleteMany).not.toHaveBeenCalled();
  });
});
