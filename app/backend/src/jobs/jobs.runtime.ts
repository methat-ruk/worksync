import { createServer, type Server } from "node:http";
import { performance } from "node:perf_hooks";
import { Worker, type Job, type Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

import { SessionCleanupService, SESSION_RETENTION_MS } from "../auth/services/session-cleanup.service";
import type { JobsConfig } from "./jobs.config";
import { jobsConnection, jobsQueue, controlDeadline } from "./jobs.connection";
import { createJobsDatabase, type JobsDatabase } from "./jobs.database";
import { CLEANUP_DATA, CLEANUP_NAME, CLEANUP_OPTIONS, CLEANUP_QUEUE, CLEANUP_SCHEDULE, safeJobError, validateCleanupJob } from "./jobs.contract";

export class JobsRuntime {
  private readonly database: JobsDatabase;
  private readonly queueClient: Redis;
  private readonly workerClient: Redis;
  readonly queue: Queue;
  private worker?: Worker;
  private server?: Server;
  private stopping = false;
  private closing?: Promise<void>;
  private probeTimer?: NodeJS.Timeout;
  private snapshotTimer?: NodeJS.Timeout;
  private probing = false;
  private snapshotting = false;
  private readyAt = 0;
  private startedAt = Date.now();
  private lastApply: number | null = null;
  private lastDryRun: number | null = null;
  private cappedPasses = 0;
  private permanentFailure = false;

  constructor(private readonly config: JobsConfig, private readonly logger: Logger) {
    this.database = createJobsDatabase(config.databaseUrl);
    this.queueClient = jobsConnection(config, false, logger);
    this.workerClient = jobsConnection(config, true, logger);
    this.queue = jobsQueue(config, this.queueClient);
    this.queue.on("error", () => this.logger.warn({ event: "jobs_queue_error" }));
  }

  async start(): Promise<void> {
    await controlDeadline(this.initialize(), () => this.forceClose(), 15000);
  }

  private async initialize(): Promise<void> {
    await this.queue.waitUntilReady();
    await this.database.prisma.$connect();
    if (this.stopping) return;
    await this.queue.setGlobalConcurrency(1);
    if (this.config.scheduler) {
      await this.queue.upsertJobScheduler(CLEANUP_SCHEDULE, { every: 900000 }, {
        name: CLEANUP_NAME, data: CLEANUP_DATA, opts: CLEANUP_OPTIONS
      });
    }
    await this.restoreHistory();
    if (this.stopping) return;
    const handler = new SessionCleanupService(this.database.prisma);
    this.worker = new Worker(CLEANUP_QUEUE, async (job: Job) => {
      validateCleanupJob(job.name, job.data);
      const started = performance.now();
      const watchdog = setTimeout(() => {
        this.logger.fatal({ event: "jobs_attempt_watchdog", reasonCode: "ATTEMPT_DEADLINE" });
        this.forceClose();
        process.exit(1);
      }, 30000);
      this.logger.info({ event: "job_started", jobId: job.id, attempt: job.attemptsMade + 1, mode: this.config.mode });
      try {
        const result = await handler.run(this.config.mode, () => this.stopping);
        if (result.mode === "apply") this.lastApply = Date.now(); else this.lastDryRun = Date.now();
        this.cappedPasses = result.capped ? this.cappedPasses + 1 : 0;
        this.logger.info({ event: "job_pass_completed", jobId: job.id, durationMs: Math.round(performance.now() - started), ...result });
        return result;
      } catch (error: unknown) {
        const safe = safeJobError(error);
        if (safe.name === "UnrecoverableError") this.permanentFailure = true;
        throw safe;
      } finally { clearTimeout(watchdog); }
    }, {
      connection: this.workerClient, prefix: this.config.prefix, autorun: false,
      concurrency: 1, lockDuration: 30000, lockRenewTime: 15000,
      stalledInterval: 30000, maxStalledCount: 1
    });
    this.worker.on("error", () => { this.readyAt = 0; this.logger.warn({ event: "jobs_worker_error" }); });
    this.worker.on("failed", (job) => this.logger.warn({ event: "job_failed", jobId: job?.id, attempt: job?.attemptsMade }));
    this.worker.on("stalled", (jobId) => this.logger.warn({ event: "job_stalled", jobId }));
    await this.worker.waitUntilReady();
    if (this.stopping) return;
    this.server = createServer((request, response) => {
      const live = request.url === "/health/live";
      const ready = request.url === "/health/ready";
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      response.statusCode = !live && !ready ? 404 : live || this.isReady() ? 200 : 503;
      response.end(JSON.stringify({ status: response.statusCode === 200 ? "ok" : "unavailable" }));
    });
    this.server.requestTimeout = 3000;
    this.server.headersTimeout = 3000;
    this.server.timeout = 3000;
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(this.config.healthPort, "127.0.0.1", resolve);
    });
    await this.probe();
    if (!this.readyAt && !await this.queue.isPaused()) throw new Error("DEPENDENCIES_UNREADY");
    if (this.stopping) return;
    void this.worker.run().catch(() => {
      if (!this.stopping) { this.permanentFailure = true; this.logger.error({ event: "jobs_consumer_stopped" }); }
    });
    this.probeTimer = setInterval(() => void this.probe(), 10000);
    this.snapshotTimer = setInterval(() => void this.snapshot(), 60000);
    this.logger.info({ event: "jobs_started", mode: this.config.mode, scheduler: this.config.scheduler });
  }

  isReady(): boolean {
    return !this.stopping && !this.permanentFailure && this.readyAt > Date.now() - 15000;
  }

  private async probe(): Promise<void> {
    if (this.probing || this.stopping) return;
    this.probing = true;
    try {
      await controlDeadline(Promise.all([
        this.queueClient.ping(), this.database.prisma.$queryRaw`SELECT 1`
      ]), () => { this.readyAt = 0; }, 3000);
      this.readyAt = await this.queue.isPaused() ? 0 : Date.now();
    } catch { this.readyAt = 0; }
    finally { this.probing = false; }
  }

  private async restoreHistory(): Promise<void> {
    const completed = await this.queue.getJobs(["completed"], 0, 99);
    for (const job of completed) {
      const result: unknown = job.returnvalue;
      if (!result || typeof result !== "object" || !("mode" in result) || !job.finishedOn) continue;
      if (result.mode === "apply") this.lastApply = Math.max(this.lastApply ?? 0, job.finishedOn);
      if (result.mode === "dry-run") this.lastDryRun = Math.max(this.lastDryRun ?? 0, job.finishedOn);
    }
  }

  private async snapshot(): Promise<void> {
    if (this.snapshotting || this.stopping) return;
    this.snapshotting = true;
    try {
      const counts = await this.queue.getJobCounts("waiting", "active", "delayed", "failed");
      const jobs = await this.queue.getJobs(["waiting", "delayed"], 0, 10, true);
      const due = jobs.map((job) => job.timestamp + job.delay).filter((date) => date <= Date.now());
      const oldestDueMs = due.length ? Date.now() - Math.min(...due) : 0;
      const oldest = await this.database.prisma.authSession.findFirst({
        where: { expiresAt: { lte: new Date(Date.now() - SESSION_RETENTION_MS) } },
        orderBy: { expiresAt: "asc" }, select: { expiresAt: true }
      });
      if ((counts.waiting ?? 0) > 10 || due.length > 10) {
        await this.queue.pause(); this.readyAt = 0;
        this.logger.error({ event: "jobs_overload_paused" });
      }
      const lastPass = this.config.mode === "apply" ? this.lastApply : this.lastDryRun;
      this.logger.info({ event: "jobs_snapshot", counts, oldestDueMs, lastApply: this.lastApply,
        lastDryRun: this.lastDryRun, cappedPasses: this.cappedPasses, oldestEligibleExpiry: oldest?.expiresAt ?? null });
      const scheduledPassStale = this.config.scheduler && Date.now() - (lastPass ?? this.startedAt) > 2700000;
      if (scheduledPassStale || oldestDueMs > 2700000 || this.cappedPasses >= 3 || !this.isReady()) {
        this.logger.warn({ event: "jobs_operator_attention", reasonCode: "CLEANUP_PROGRESS_OR_DEPENDENCY" });
      }
    } catch { this.logger.warn({ event: "jobs_snapshot_unavailable" }); }
    finally { this.snapshotting = false; }
  }

  stop(): Promise<void> {
    this.closing ??= this.drain();
    return this.closing;
  }

  private async drain(): Promise<void> {
    this.stopping = true; this.readyAt = 0;
    clearInterval(this.probeTimer); clearInterval(this.snapshotTimer);
    await this.worker?.close();
    await this.queue.close();
    this.queueClient.disconnect(); this.workerClient.disconnect();
    await this.database.close();
    this.server?.closeAllConnections();
    if (this.server?.listening) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.logger.info({ event: "jobs_stopped" });
  }

  forceClose(): void {
    this.stopping = true; this.readyAt = 0;
    clearInterval(this.probeTimer); clearInterval(this.snapshotTimer);
    this.queueClient.disconnect(); this.workerClient.disconnect();
    void this.worker?.close(true).catch(() => undefined);
    this.database.forceClose(); this.server?.closeAllConnections();
    this.server?.close();
  }
}
