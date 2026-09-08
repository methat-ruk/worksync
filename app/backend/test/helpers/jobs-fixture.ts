import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Pool } from "pg";
import pino from "pino";
import { createJobsDatabase } from "../../src/jobs/jobs.database";
import { parseJobsConfig } from "../../src/jobs/jobs.config";
import { jobsConnection, jobsQueue } from "../../src/jobs/jobs.connection";

export async function jobsFixture() {
  if (!process.execArgv.includes("--experimental-vm-modules")) {
    throw new Error("Jobs tests require the project runner: pnpm test:services (Prisma VM modules)");
  }
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith("_test")) throw new Error("Jobs fixture requires a test database");
  const schema = `jobs_test_${randomUUID().replaceAll("-", "")}`;
  url.searchParams.set("schema", schema);
  const environment = {
    NODE_ENV: "test", LOG_LEVEL: "silent", JOBS_DATABASE_URL: url.toString(),
    JOBS_REDIS_URL: process.env.TEST_REDIS_URL ?? process.env.REDIS_URL!,
    JOBS_QUEUE_PREFIX: schema, JOBS_SCHEDULER_ENABLED: "false", JOBS_SESSION_CLEANUP_MODE: "apply"
  };
  const admin = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
  async function dropSchema() {
    if (!/^jobs_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Unsafe fixture cleanup");
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  try {
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
      cwd: path.resolve(__dirname, "../.."), env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe", timeout: 30000
    });
  } catch {
    try { await dropSchema(); } finally { await admin.end(); }
    throw new Error("Isolated jobs schema migration failed; check test PostgreSQL prerequisite");
  }
  const config = parseJobsConfig(environment);
  const db = createJobsDatabase(config.databaseUrl);
  const client = jobsConnection(config, false, pino({ level: "silent" }));
  const queue = jobsQueue(config, client);
  queue.on("error", () => undefined);
  try { await db.prisma.$connect(); await queue.waitUntilReady(); }
  catch {
    client.disconnect(); await queue.close(); await db.close();
    try { await dropSchema(); } finally { await admin.end(); }
    throw new Error("Jobs prerequisites unavailable; use pnpm test:services with test PostgreSQL/Redis");
  }
  return {
    schema, config, environment, db, queue, client, admin,
    async close() {
      // Only this generated test namespace; never flush a shared Redis database.
      await queue.obliterate({ force: true });
      await queue.close(); client.disconnect(); await db.close();
      await dropSchema();
      await admin.end();
    }
  };
}

export async function eventually(check: () => Promise<boolean>, timeout = 10000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Expected jobs condition was not reached within deadline");
}
