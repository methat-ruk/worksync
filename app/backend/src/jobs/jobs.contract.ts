import { UnrecoverableError, type JobsOptions } from "bullmq";

export const CLEANUP_QUEUE = "auth-session-maintenance-v1";
export const CLEANUP_NAME = "auth-session-cleanup";
export const CLEANUP_SCHEDULE = "auth-session-cleanup-v1";
export const CLEANUP_MANUAL = "auth-session-cleanup-manual-v1";
export const CLEANUP_DATA = Object.freeze({ type: CLEANUP_NAME, version: 1 });
export const CLEANUP_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000, jitter: 0.5 },
  removeOnComplete: { age: 86400, count: 100 },
  removeOnFail: { age: 604800, count: 1000 }
};

export function validateCleanupJob(name: string, data: unknown): void {
  if (name !== CLEANUP_NAME || data === null || typeof data !== "object" ||
      Object.getPrototypeOf(data) !== Object.prototype ||
      Object.keys(data).length !== 2 || !("type" in data) || !("version" in data) ||
      data.type !== CLEANUP_NAME || data.version !== 1 ||
      Buffer.byteLength(JSON.stringify(data)) > 256) {
    throw new UnrecoverableError("INVALID_JOB_CONTRACT");
  }
}

export function safeJobError(error: unknown): Error {
  if (error instanceof UnrecoverableError) return new UnrecoverableError("INVALID_JOB_CONTRACT");
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } } } : undefined;
  const code = record?.meta?.driverAdapterError?.cause?.originalCode ?? record?.meta?.code ?? record?.code;
  if (["P1001", "P1002", "P1008", "P1017", "P2024", "P2028", "P2034", "40001", "40P01", "55P03", "57014", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(String(code))) {
    return new Error("DATABASE_TRANSIENT_FAILURE");
  }
  if (record?.message === "Query read timeout") return new Error("DATABASE_TRANSIENT_FAILURE");
  if (record?.message === "CLOCK_SKEW") return new UnrecoverableError("CLOCK_SKEW");
  return new UnrecoverableError("DATABASE_OR_HANDLER_FAILURE");
}
