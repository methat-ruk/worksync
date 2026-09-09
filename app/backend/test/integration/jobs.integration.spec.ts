import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { SessionCleanupService, SESSION_RETENTION_MS } from "../../src/auth/services/session-cleanup.service";
import { CLEANUP_DATA, CLEANUP_NAME, CLEANUP_QUEUE, CLEANUP_OPTIONS, safeJobError, validateCleanupJob } from "../../src/jobs/jobs.contract";
import { executeControl, parseControlArguments } from "../../src/jobs/control";
import { jobsFixture, eventually } from "../helpers/jobs-fixture";

describe("session cleanup real PostgreSQL and BullMQ", () => {
  let fixture: Awaited<ReturnType<typeof jobsFixture>>;
  let userId: string;
  const workers: Worker<unknown, unknown>[] = [];
  beforeAll(async () => {
    fixture = await jobsFixture();
    const user = await fixture.db.prisma.user.create({ data: { email: "jobs@example.com", displayName: "Jobs fixture" } });
    userId = user.id;
  }, 40000);
  afterEach(async () => {
    await Promise.all(workers.splice(0).map((worker) => worker.close()));
    await fixture.db.prisma.authSession.deleteMany();
  });
  afterAll(async () => { if (fixture) await fixture.close(); });

  async function seed(count: number, expiresAt: Date, revokedAt?: Date) {
    await fixture.db.prisma.authSession.createMany({ data: Array.from({ length: count }, () => ({ id: randomUUID(), userId, refreshTokenHash: "test-hash-canary", expiresAt, ...(revokedAt ? { revokedAt } : {}) })) });
  }
  const old = () => new Date(Date.now() - SESSION_RETENTION_MS - 86400000);

  it("dry-runs unique rows and deletes only expired beyond retention", async () => {
    await seed(501, old());
    await seed(1, new Date(Date.now() + 86400000));
    await seed(1, new Date(Date.now() - 86400000));
    await seed(1, new Date(Date.now() + 86400000), new Date());
    const handler = new SessionCleanupService(fixture.db.prisma);
    expect(await handler.run("dry-run")).toMatchObject({ wouldDelete: 501, deleted: 0, batches: 2, capped: false });
    expect(await fixture.db.prisma.authSession.count()).toBe(504);
    expect(await handler.run("apply")).toMatchObject({ deleted: 501, wouldDelete: 0 });
    expect(await fixture.db.prisma.authSession.count()).toBe(3);
    expect(await handler.run("apply")).toMatchObject({ deleted: 0 });
    expect(await fixture.db.prisma.user.count()).toBe(1);
  });

  it("uses the database clock at the inclusive retention boundary across users", async () => {
    const other = await fixture.db.prisma.user.create({ data: { email: `boundary-${randomUUID()}@example.com`, displayName: "Boundary fixture" } });
    const clock = await fixture.admin.query<{ now: Date }>("SELECT CURRENT_TIMESTAMP AS now");
    const cutoff = clock.rows[0]!.now.getTime() - SESSION_RETENTION_MS;
    await fixture.db.prisma.authSession.createMany({ data: [
      { id: randomUUID(), userId, refreshTokenHash: "before", expiresAt: new Date(cutoff - 1000) },
      { id: randomUUID(), userId: other.id, refreshTokenHash: "at", expiresAt: new Date(cutoff) },
      { id: randomUUID(), userId: other.id, refreshTokenHash: "after", expiresAt: new Date(cutoff + 60000) }
    ] });
    expect(await new SessionCleanupService(fixture.db.prisma).run("apply")).toMatchObject({ deleted: 2 });
    const remaining = await fixture.db.prisma.authSession.findMany({ select: { refreshTokenHash: true } });
    expect(remaining).toEqual([{ refreshTokenHash: "after" }]);
  });

  it("caps backlog and preserves rows on cooperative shutdown", async () => {
    await seed(5001, old());
    const handler = new SessionCleanupService(fixture.db.prisma);
    expect(await handler.run("apply", () => true)).toMatchObject({ deleted: 0, capped: true });
    expect(await handler.run("apply")).toMatchObject({ deleted: 5000, capped: true });
    expect(await fixture.db.prisma.authSession.count()).toBe(1);
  }, 20000);

  it("converges with duplicate execution independently of queue locks", async () => {
    await seed(700, old());
    const handler = new SessionCleanupService(fixture.db.prisma);
    const outcomes = await Promise.all([handler.run("apply"), handler.run("apply")]);
    expect(outcomes.reduce((sum, result) => sum + result.deleted, 0)).toBe(700);
    expect(await fixture.db.prisma.authSession.count()).toBe(0);
  });

  it("propagates PostgreSQL statement timeout through the worker adapter", async () => {
    const started = Date.now();
    try {
      await fixture.db.prisma.$queryRaw`SELECT pg_sleep(10)`;
      throw new Error("Expected query timeout");
    } catch (error: unknown) {
      expect(safeJobError(error).message).toBe("DATABASE_TRANSIENT_FAILURE");
    }
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(fixture.db.prisma.$queryRaw`SELECT 1`).resolves.toHaveLength(1);
  }, 10000);

  it("rechecks eligibility after a concurrent expiry extension commits", async () => {
    await seed(1, old());
    const connection = await fixture.admin.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(`UPDATE "${fixture.schema}"."AuthSession" SET "expiresAt" = CURRENT_TIMESTAMP + INTERVAL '1 day'`);
      const result = new SessionCleanupService(fixture.db.prisma).run("apply");
      // The cleaner sees the old committed expiry, then waits behind this update.
      await eventually(async () => {
        const waiting = await fixture.admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = 'worksync-session-cleanup' AND wait_event_type = 'Lock'");
        return waiting.rowCount !== 0;
      }, 400);
      await connection.query("COMMIT");
      expect(await result).toMatchObject({ deleted: 0 });
      expect(await fixture.db.prisma.authSession.count()).toBe(1);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });

  it("rolls back a cleanup batch on a real lock timeout and succeeds after release", async () => {
    await seed(2, old());
    const connection = await fixture.admin.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(`SELECT id FROM "${fixture.schema}"."AuthSession" FOR UPDATE`);
      const handler = new SessionCleanupService(fixture.db.prisma);
      await expect(handler.run("apply").catch((error: unknown) => { throw safeJobError(error); })).rejects.toThrow("DATABASE_TRANSIENT_FAILURE");
      expect(await fixture.db.prisma.authSession.count()).toBe(2);
      await connection.query("COMMIT");
      expect(await handler.run("apply")).toMatchObject({ deleted: 2 });
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
  });

  it("queues success, terminal poison and bounded retry with sanitized failures", async () => {
    await seed(2, old());
    let attempts = 0;
    const timestamps: number[] = [];
    const worker = new Worker(CLEANUP_QUEUE, async (job) => {
      validateCleanupJob(job.name, job.data);
      if (job.id === "retry-fixture") {
        attempts++; timestamps.push(Date.now());
        throw safeJobError({ code: "P2034", message: "test-secret-canary" });
      }
      return new SessionCleanupService(fixture.db.prisma).run("apply");
    }, { connection: { ...fixture.config.redis, maxRetriesPerRequest: null }, prefix: fixture.config.prefix, concurrency: 1 });
    workers.push(worker); worker.on("error", () => undefined);
    const success = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA, { jobId: "success" });
    await eventually(async () => await success.getState() === "completed");
    expect(await fixture.db.prisma.authSession.count()).toBe(0);
    const poison = await fixture.queue.add(CLEANUP_NAME, { ...CLEANUP_DATA, version: 99 });
    await eventually(async () => await poison.getState() === "failed");
    const retry = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA, { ...CLEANUP_OPTIONS, jobId: "retry-fixture" });
    await eventually(async () => await retry.getState() === "failed", 25000);
    expect(attempts).toBe(3);
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(2400);
    expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(4900);
    const saved = await fixture.queue.getJob(retry.id!);
    expect(JSON.stringify(saved?.toJSON())).not.toContain("test-secret-canary");
  }, 35000);

  it("keeps manual enqueue idempotent and inspection read-only", async () => {
    const args = parseControlArguments(["enqueue", "--apply"]);
    const first = await executeControl(fixture.queue, args);
    expect(await executeControl(fixture.queue, args)).toEqual(first);
    const before = await fixture.queue.getJobCounts();
    await executeControl(fixture.queue, parseControlArguments([]));
    expect(await fixture.queue.getJobCounts()).toEqual(before);
  });

  it("enforces exact job state and identifiers for operator mutations", async () => {
    await expect(executeControl(fixture.queue, parseControlArguments(["remove-failed", "missing", "--apply", "--reason=investigation-complete"]))).rejects.toThrow("JOB_NOT_FOUND");
    const worker = new Worker(CLEANUP_QUEUE, async (job) => {
      validateCleanupJob(job.name, job.data);
      return { mode: "dry-run" };
    }, { connection: { ...fixture.config.redis, maxRetriesPerRequest: null }, prefix: fixture.config.prefix, concurrency: 1 });
    workers.push(worker); worker.on("error", () => undefined);
    const completed = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA, { jobId: `operator-${randomUUID()}` });
    await eventually(async () => await completed.getState() === "completed");
    await expect(executeControl(fixture.queue, parseControlArguments(["remove-failed", completed.id!, "--apply", "--reason=investigation-complete"]))).rejects.toThrow("JOB_STATE_MISMATCH");
    const before = await fixture.queue.getJobCounts();
    const page = await executeControl(fixture.queue, parseControlArguments(["inspect", "--page=1"]));
    expect(page).toMatchObject({ page: 1, paused: false });
    expect(await fixture.queue.getJobCounts()).toEqual(before);
    await executeControl(fixture.queue, parseControlArguments(["remove-completed", completed.id!, "--apply", "--reason=investigation-complete"]));
    expect(await fixture.queue.getJob(completed.id!)).toBeUndefined();
  });

  it("retries only a validated failed job after explicit operator action", async () => {
    const failing = new Worker<unknown, unknown>(CLEANUP_QUEUE, async () => { throw safeJobError({ code: "P2034" }); }, {
      connection: { ...fixture.config.redis, maxRetriesPerRequest: null }, prefix: fixture.config.prefix, concurrency: 1
    });
    workers.push(failing); failing.on("error", () => undefined);
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA, { jobId: `retry-control-${randomUUID()}`, attempts: 1 });
    await eventually(async () => await job.getState() === "failed");
    await failing.close();
    workers.splice(workers.indexOf(failing), 1);
    await executeControl(fixture.queue, parseControlArguments(["retry", job.id!, "--apply", "--reason=dependency-recovered"]));
    await eventually(async () => await job.getState() === "waiting");
    const succeeding = new Worker<unknown, unknown>(CLEANUP_QUEUE, async (candidate) => {
      validateCleanupJob(candidate.name, candidate.data);
      return { mode: "dry-run" };
    }, { connection: { ...fixture.config.redis, maxRetriesPerRequest: null }, prefix: fixture.config.prefix, concurrency: 1 });
    workers.push(succeeding); succeeding.on("error", () => undefined);
    await eventually(async () => await job.getState() === "completed");
  });

  it("uses the expiry index for a mostly-active representative fixture", async () => {
    await seed(10, old());
    await seed(4000, new Date(Date.now() + 86400000));
    await fixture.admin.query(`ANALYZE "${fixture.schema}"."AuthSession"`);
    const plan = await fixture.admin.query(`EXPLAIN (FORMAT JSON) SELECT id, "expiresAt" FROM "${fixture.schema}"."AuthSession" WHERE "expiresAt" <= CURRENT_TIMESTAMP - INTERVAL '30 days' ORDER BY "expiresAt" ASC, id ASC LIMIT 500`);
    expect(JSON.stringify(plan.rows)).toContain("AuthSession_expiresAt_idx");
    const started = Date.now();
    expect(await new SessionCleanupService(fixture.db.prisma).run("dry-run")).toMatchObject({ wouldDelete: 10 });
    expect(Date.now() - started).toBeLessThan(2000);
  }, 10000);

  it("keeps the worker database pool bounded under concurrent queries", async () => {
    const started = Date.now();
    const queries = Array.from({ length: 3 }, () => fixture.db.prisma.$queryRaw`SELECT 1 FROM pg_sleep(1)`);
    await Promise.all(queries);
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(1800);
    expect(elapsed).toBeLessThan(4000);
  }, 6000);
});
