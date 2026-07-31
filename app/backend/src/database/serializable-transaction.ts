import { Prisma } from "../generated/prisma/client";
import type { PrismaService } from "./prisma.service";

const DEFAULT_DELAYS_MS = [25, 50] as const;

export class SerializableTransactionExhaustedError extends Error {
  constructor(options?: ErrorOptions) {
    super("Serializable transaction retry limit exhausted", options);
    this.name = "SerializableTransactionExhaustedError";
  }
}

export type SerializableTransactionOptions = Readonly<{
  delaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
}>;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export function isSerializableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

export async function runSerializableTransaction<T>(
  prisma: PrismaService,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  options: SerializableTransactionOptions = {}
): Promise<T> {
  const delaysMs = options.delaysMs ?? DEFAULT_DELAYS_MS;
  const waitForRetry = options.wait ?? wait;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error: unknown) {
      if (!isSerializableConflict(error)) {
        throw error;
      }

      const delayMs = delaysMs[attempt];
      if (delayMs === undefined) {
        throw new SerializableTransactionExhaustedError({ cause: error });
      }
      await waitForRetry(delayMs);
    }
  }
}
