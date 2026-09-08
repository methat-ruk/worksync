import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { once } from "node:events";
import { CLEANUP_DATA, CLEANUP_NAME, CLEANUP_SCHEDULE } from "../../src/jobs/jobs.contract";
import { jobsFixture, eventually } from "../helpers/jobs-fixture";

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

describe("compiled jobs process lifecycle", () => {
  let fixture: Awaited<ReturnType<typeof jobsFixture>>;
  const children: ChildProcess[] = [];
  let logs = "";
  beforeAll(async () => { fixture = await jobsFixture(); }, 40000);
  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit"); child.kill("SIGKILL"); await exited;
      }
    }
    // Each case may intentionally abandon a lock. Clear only this fixture's prefix
    // so a stalled job cannot consume the next case's global worker slot.
    await fixture.queue.obliterate({ force: true });
    await fixture.queue.resume();
  });
  afterAll(async () => { if (fixture) await fixture.close(); });

  async function start(scheduler = false, fault?: "pre-commit" | "commit-before-ack" | "hang") {
    const port = await availablePort();
    const entry = path.resolve(__dirname, "../../dist/worker.js");
    const handler = path.resolve(__dirname, "../../dist/auth/services/session-cleanup.service.js");
    // Inject faults only in this test-owned child, never in production configuration.
    const injectedRun = fault === "hang"
      ? "() => new Promise(() => {})"
      : fault === "pre-commit"
        ? "async function () { process.kill(process.pid, 'SIGKILL'); }"
        : "async function (...args) { await run.apply(this, args); process.kill(process.pid, 'SIGKILL'); }";
    const args = fault ? ["-e", `
      const { SessionCleanupService } = require(${JSON.stringify(handler)});
      const run = SessionCleanupService.prototype.run;
      SessionCleanupService.prototype.run = ${injectedRun};
      require(${JSON.stringify(entry)}).bootstrapWorker().catch(() => process.exit(1));
    `] : [entry];
    const child = spawn(process.execPath, args, {
      env: { PATH: process.env.PATH, ...fixture.environment, LOG_LEVEL: "info", JOBS_HEALTH_PORT: String(port), JOBS_SCHEDULER_ENABLED: String(scheduler) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    child.stdout!.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
    child.stderr!.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
    await eventually(async () => {
      try { return (await fetch(`http://127.0.0.1:${port}/health/ready`)).ok; } catch { return false; }
    }, 16000);
    return { child, port };
  }

  it("starts without API secrets, processes a real job and drains on repeated signals", async () => {
    const { child, port } = await start();
    expect((await fetch(`http://127.0.0.1:${port}/health/live`)).status).toBe(200);
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA);
    await eventually(async () => await job.getState() === "completed");
    const exited = once(child, "exit");
    child.kill("SIGTERM"); child.kill("SIGTERM");
    const [code] = await exited;
    expect(code).toBe(0);
    expect(logs).toContain("jobs_stopped");
    expect(logs).not.toMatch(/refreshTokenHash|postgresql:\/\/|redis:\/\/|JWT_ACCESS_SECRET/);
  }, 25000);

  it("upserts one schedule across two process starts and stops without removing it", async () => {
    const first = await start(true);
    const second = await start(true);
    expect(await fixture.queue.getJobSchedulersCount()).toBe(1);
    for (const { child } of [first, second]) {
      const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
    }
    expect(await fixture.queue.getJobSchedulersCount()).toBe(1);
    await fixture.queue.removeJobScheduler(CLEANUP_SCHEDULE);
  }, 30000);

  it("fails readiness when globally paused and resumes after operator recovery", async () => {
    const { port } = await start();
    await fixture.queue.pause();
    await eventually(async () => (await fetch(`http://127.0.0.1:${port}/health/ready`)).status === 503, 12000);
    expect((await fetch(`http://127.0.0.1:${port}/health/live`)).status).toBe(200);
    await fixture.queue.resume();
    await eventually(async () => (await fetch(`http://127.0.0.1:${port}/health/ready`)).ok, 12000);
  }, 30000);

  it("recovers a committed deletion after process death before queue acknowledgement", async () => {
    const user = await fixture.db.prisma.user.create({ data: { email: "crash@example.com", displayName: "Crash fixture" } });
    await fixture.db.prisma.authSession.create({ data: { userId: user.id, refreshTokenHash: "crash-canary", expiresAt: new Date(0) } });
    const { child } = await start(false, "commit-before-ack");
    const exited = once(child, "exit");
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA);
    expect((await exited)[1]).toBe("SIGKILL");
    expect(await fixture.db.prisma.authSession.count()).toBe(0);
    expect(await job.getState()).toBe("active");
    await start();
    await eventually(async () => await job.getState() === "completed", 100000);
    const recovered = await fixture.queue.getJob(job.id!);
    expect(recovered?.returnvalue).toMatchObject({ deleted: 0 });
  }, 85000);

  it("preserves data and redelivers after process death before the handler commits", async () => {
    const user = await fixture.db.prisma.user.create({ data: { email: "precommit@example.com", displayName: "Precommit fixture" } });
    await fixture.db.prisma.authSession.create({ data: { userId: user.id, refreshTokenHash: "precommit-canary", expiresAt: new Date(0) } });
    const { child } = await start(false, "pre-commit");
    const exited = once(child, "exit");
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA);
    expect((await exited)[1]).toBe("SIGKILL");
    expect(await fixture.db.prisma.authSession.count()).toBe(1);
    await start();
    await eventually(async () => await job.getState() === "completed", 100000);
    expect(await fixture.db.prisma.authSession.count()).toBe(0);
  }, 85000);

  it("moves a repeatedly abandoned job to failed after stall exhaustion", async () => {
    const first = await start(false, "pre-commit");
    const firstExit = once(first.child, "exit");
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA, { jobId: "stall-exhaustion" });
    expect((await firstExit)[1]).toBe("SIGKILL");

    const second = await start(false, "pre-commit");
    const secondExit = once(second.child, "exit");
    expect((await secondExit)[1]).toBe("SIGKILL");

    await start();
    await eventually(async () => await job.getState() === "failed", 70000);
    const failed = await fixture.queue.getJob(job.id!);
    expect(failed?.failedReason).toMatch(/stalled more than allowable limit/i);
  }, 155000);

  it("terminates an unsettled handler at the hard attempt deadline", async () => {
    const { child } = await start(false, "hang");
    const exited = once(child, "exit");
    const started = Date.now();
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA);
    expect((await exited)[0]).toBe(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(29000);
    expect(Date.now() - started).toBeLessThan(35000);
    expect(logs).toContain("jobs_attempt_watchdog");
    // Recover the abandoned lock before fixture teardown.
    await start();
    await eventually(async () => await job.getState() === "completed", 100000);
  }, 110000);

  it("bounds shutdown while an active handler cannot settle", async () => {
    const { child } = await start(false, "hang");
    const job = await fixture.queue.add(CLEANUP_NAME, CLEANUP_DATA);
    await eventually(async () => await job.getState() === "active");
    const exited = once(child, "exit");
    const started = Date.now();
    child.kill("SIGTERM");
    expect((await exited)[0]).toBe(1);
    expect(Date.now() - started).toBeLessThan(32000);
    await start();
    await eventually(async () => await job.getState() === "completed", 100000);
  }, 110000);

  it("exits within the bootstrap deadline while Redis is disconnected", async () => {
    const redisPort = await availablePort();
    const healthPort = await availablePort();
    const child = spawn(process.execPath, [path.resolve(__dirname, "../../dist/worker.js")], {
      env: { PATH: process.env.PATH, ...fixture.environment, LOG_LEVEL: "info",
        JOBS_REDIS_URL: `redis://127.0.0.1:${redisPort}/1`, JOBS_HEALTH_PORT: String(healthPort) },
      stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    child.stdout!.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
    child.stderr!.on("data", (chunk: Buffer) => { logs += chunk.toString(); });
    const exited = once(child, "exit");
    const started = Date.now();
    const [code] = await exited;
    expect(code).toBe(1);
    expect(Date.now() - started).toBeLessThan(18000);
    expect(logs).not.toMatch(/postgresql:\/\/|redis:\/\//);
  }, 22000);
});
