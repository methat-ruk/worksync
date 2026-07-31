import type { PrismaService } from "../../src/database/prisma.service";
import {
  runSerializableTransaction,
  SerializableTransactionExhaustedError
} from "../../src/database/serializable-transaction";
import { Prisma } from "../../src/generated/prisma/client";

function conflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("write conflict", {
    code: "P2034",
    clientVersion: "7.9.0"
  });
}

describe("runSerializableTransaction", () => {
  it("retries the complete operation with reviewed delays", async () => {
    const transaction = {};
    const operation = jest
      .fn()
      .mockRejectedValueOnce(conflict())
      .mockRejectedValueOnce(conflict())
      .mockResolvedValue("done");
    const prisma = {
      $transaction: jest.fn(
        (callback: (database: unknown) => Promise<unknown>) =>
          callback(transaction)
      )
    } as unknown as PrismaService;
    const wait = jest.fn().mockResolvedValue(undefined);

    await expect(
      runSerializableTransaction(prisma, operation, { wait })
    ).resolves.toBe("done");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[25], [50]]);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      operation,
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      })
    );
  });

  it("fails closed after three total attempts", async () => {
    const operation = jest.fn().mockRejectedValue(conflict());
    const prisma = {
      $transaction: jest.fn(
        (callback: (database: unknown) => Promise<unknown>) =>
          callback({})
      )
    } as unknown as PrismaService;

    await expect(
      runSerializableTransaction(prisma, operation, {
        wait: jest.fn().mockResolvedValue(undefined)
      })
    ).rejects.toBeInstanceOf(SerializableTransactionExhaustedError);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-serialization failures", async () => {
    const error = new Error("validation failed");
    const operation = jest.fn().mockRejectedValue(error);
    const prisma = {
      $transaction: jest.fn(
        (callback: (database: unknown) => Promise<unknown>) =>
          callback({})
      )
    } as unknown as PrismaService;

    await expect(
      runSerializableTransaction(prisma, operation)
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
