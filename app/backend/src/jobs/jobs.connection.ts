import { Redis } from "ioredis";
import { Queue } from "bullmq";
import type { Logger } from "pino";
import type { JobsConfig } from "./jobs.config";
import { CLEANUP_OPTIONS, CLEANUP_QUEUE } from "./jobs.contract";

export function jobsConnection(config: JobsConfig, consumer: boolean, logger: Logger): Redis {
  const client = new Redis({
    ...config.redis, lazyConnect: true, connectTimeout: 3000,
    maxRetriesPerRequest: consumer ? null : 1,
    enableOfflineQueue: consumer,
    ...(consumer ? {} : { commandTimeout: 3000 }),
    retryStrategy: (attempt) => Math.min(10000, 1000 * 2 ** Math.min(attempt, 4)) * (0.5 + Math.random() / 2)
  });
  let lastError = 0;
  client.on("error", () => {
    if (Date.now() - lastError > 10000) {
      logger.warn({ event: "jobs_redis_unavailable", reasonCode: "REDIS_UNAVAILABLE" });
      lastError = Date.now();
    }
  });
  return client;
}

export function jobsQueue(config: JobsConfig, connection: Redis): Queue {
  return new Queue(CLEANUP_QUEUE, { connection, prefix: config.prefix, defaultJobOptions: CLEANUP_OPTIONS });
}

/** Only for bounded control/probe operations; never releases an active DB handler. */
export async function controlDeadline<T>(operation: Promise<T>, cancel: () => void, milliseconds = 5000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { cancel(); reject(new Error("CONTROL_DEADLINE_UNKNOWN_ACK")); }, milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}
