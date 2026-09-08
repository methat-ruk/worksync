import { readFileSync } from "node:fs";
import type { RedisOptions } from "ioredis";

import { LOG_LEVEL_VALUES, NODE_ENV_VALUES } from "../config/environment";

export type JobsConfig = Readonly<{
  environment: (typeof NODE_ENV_VALUES)[number];
  logLevel: (typeof LOG_LEVEL_VALUES)[number];
  databaseUrl: string;
  redis: RedisOptions;
  prefix: string;
  mode: "dry-run" | "apply";
  scheduler: boolean;
  healthPort: number;
}>;

function invalid(key: string): never {
  throw new Error(`Invalid or missing ${key}`);
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  return env[key]?.trim() || invalid(key);
}

export function parseJobsConfig(env: NodeJS.ProcessEnv): JobsConfig {
  const environment = required(env, "NODE_ENV");
  const logLevel = required(env, "LOG_LEVEL");
  if (!NODE_ENV_VALUES.includes(environment as JobsConfig["environment"])) invalid("NODE_ENV");
  if (!LOG_LEVEL_VALUES.includes(logLevel as JobsConfig["logLevel"])) invalid("LOG_LEVEL");
  const databaseUrl = required(env, "JOBS_DATABASE_URL");
  let database: URL;
  let redis: URL;
  try { database = new URL(databaseUrl); } catch { return invalid("JOBS_DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.hash) invalid("JOBS_DATABASE_URL");
  if (environment === "test" && !/^\/[^/]+_test$/.test(database.pathname)) invalid("JOBS_DATABASE_URL test database");
  try { redis = new URL(required(env, "JOBS_REDIS_URL")); } catch { return invalid("JOBS_REDIS_URL"); }
  if (!["redis:", "rediss:"].includes(redis.protocol) || !redis.hostname || redis.search || redis.hash || !/^\/(\d+)?$|^$/.test(redis.pathname)) invalid("JOBS_REDIS_URL");
  const db = Number(redis.pathname.slice(1) || "0");
  const port = Number(redis.port || "6379");
  if (!Number.isSafeInteger(db) || db < 0 || db > 15 || !Number.isInteger(port) || port < 1 || port > 65535) invalid("JOBS_REDIS_URL");
  let username: string;
  let password: string;
  try { username = decodeURIComponent(redis.username); password = decodeURIComponent(redis.password); } catch { return invalid("JOBS_REDIS_URL credentials"); }
  if (environment === "production" && (redis.protocol !== "rediss:" || !username || !password)) invalid("JOBS_REDIS_URL production TLS/ACL");
  let ca: Buffer | undefined;
  if (env.JOBS_REDIS_CA_FILE) {
    if (redis.protocol !== "rediss:") invalid("JOBS_REDIS_CA_FILE requires TLS");
    try { ca = readFileSync(env.JOBS_REDIS_CA_FILE); } catch { return invalid("JOBS_REDIS_CA_FILE"); }
    if (!ca.length) invalid("JOBS_REDIS_CA_FILE");
  }
  const prefix = required(env, "JOBS_QUEUE_PREFIX");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(prefix)) invalid("JOBS_QUEUE_PREFIX");
  const mode = env.JOBS_SESSION_CLEANUP_MODE ?? "dry-run";
  if (mode !== "dry-run" && mode !== "apply") invalid("JOBS_SESSION_CLEANUP_MODE");
  const scheduler = required(env, "JOBS_SCHEDULER_ENABLED");
  if (scheduler !== "true" && scheduler !== "false") invalid("JOBS_SCHEDULER_ENABLED");
  const healthPort = Number(env.JOBS_HEALTH_PORT ?? "4001");
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535) invalid("JOBS_HEALTH_PORT");
  return {
    environment: environment as JobsConfig["environment"], logLevel: logLevel as JobsConfig["logLevel"],
    databaseUrl, prefix, mode, scheduler: scheduler === "true", healthPort,
    redis: {
      host: redis.hostname.replace(/^\[|\]$/g, ""), port, db,
      ...(username ? { username } : {}), ...(password ? { password } : {}),
      ...(redis.protocol === "rediss:" ? { tls: { rejectUnauthorized: true, servername: redis.hostname, ...(ca ? { ca } : {}) } } : {})
    }
  };
}
