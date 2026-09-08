import { userInfo } from "node:os";
import pino from "pino";
import type { Queue } from "bullmq";
import { parseJobsConfig } from "./jobs.config";
import { controlDeadline, jobsConnection, jobsQueue } from "./jobs.connection";
import { CLEANUP_DATA, CLEANUP_MANUAL, CLEANUP_NAME, CLEANUP_SCHEDULE, validateCleanupJob } from "./jobs.contract";

const COMMANDS = ["inspect", "enqueue", "pause", "resume", "disable-schedule", "retry", "remove-completed", "remove-failed"] as const;
const REASONS = ["dependency-recovered", "planned-maintenance", "invalid-job", "investigation-complete"];
export function parseControlArguments(args: string[]) {
  const command = args[0] ?? "inspect";
  if (!(COMMANDS as readonly string[]).includes(command)) throw new Error("UNKNOWN_CONTROL_COMMAND");
  const recordCommand = ["retry", "remove-completed", "remove-failed"].includes(command);
  const id = recordCommand ? args[1] : undefined;
  if (recordCommand && (!id || !/^[\w:.-]{1,160}$/.test(id))) throw new Error("EXACT_JOB_ID_REQUIRED");
  const options = args.slice(recordCommand ? 2 : 1);
  if (options.some((arg) => arg !== "--apply" && !arg.startsWith("--reason=") && !arg.startsWith("--page=")) || new Set(options.map((arg) => arg.split("=")[0])).size !== options.length) throw new Error("INVALID_CONTROL_ARGUMENTS");
  const reason = options.find((arg) => arg.startsWith("--reason="))?.slice(9);
  const pageValue = options.find((arg) => arg.startsWith("--page="))?.slice(7) ?? "0";
  if (!/^\d{1,3}$/.test(pageValue) || (command !== "inspect" && options.some((arg) => arg.startsWith("--page=")))) throw new Error("INVALID_PAGE");
  if (command !== "inspect" && !options.includes("--apply")) throw new Error("EXPLICIT_APPLY_REQUIRED");
  if (recordCommand && !REASONS.includes(reason ?? "")) throw new Error("REASON_REQUIRED: dependency-recovered|planned-maintenance|invalid-job|investigation-complete");
  if (reason && !REASONS.includes(reason)) throw new Error("INVALID_REASON");
  return { command, id, reason, page: Number(pageValue) };
}

export async function executeControl(queue: Queue, args: ReturnType<typeof parseControlArguments>): Promise<object> {
  if (args.command === "inspect") {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "completed", "failed");
    const jobs = await queue.getJobs(["waiting", "active", "delayed", "completed", "failed"], args.page * 20, args.page * 20 + 19);
    return { counts, paused: await queue.isPaused(), page: args.page,
      jobs: jobs.map((job) => ({ id: job.id, attempts: job.attemptsMade, finishedOn: job.finishedOn ?? null })) };
  }
  if (args.command === "enqueue") {
    validateCleanupJob(CLEANUP_NAME, CLEANUP_DATA);
    const job = await queue.add(CLEANUP_NAME, CLEANUP_DATA, { jobId: CLEANUP_MANUAL });
    return { id: job.id };
  }
  if (args.command === "pause") { await queue.pause(); return { paused: true }; }
  if (args.command === "resume") { await queue.resume(); return { paused: false }; }
  if (args.command === "disable-schedule") return { removed: await queue.removeJobScheduler(CLEANUP_SCHEDULE) };
  const job = await queue.getJob(args.id!);
  if (!job) throw new Error("JOB_NOT_FOUND");
  const expected = args.command === "remove-completed" ? "completed" : "failed";
  if (await job.getState() !== expected) throw new Error("JOB_STATE_MISMATCH");
  if (args.command === "retry") { validateCleanupJob(job.name, job.data); await job.retry("failed"); }
  else await job.remove({ removeChildren: false });
  return { id: job.id, operation: args.command };
}

export async function runControl(args: string[]): Promise<void> {
  const parsed = parseControlArguments(args);
  const config = parseJobsConfig(process.env);
  const logger = pino({ level: config.logLevel, base: { component: "jobs-control" } }, process.stderr);
  const connection = jobsConnection(config, false, logger);
  const queue = jobsQueue(config, connection);
  queue.on("error", () => undefined);
  try {
    const result = await controlDeadline((async () => {
      await queue.waitUntilReady();
      return executeControl(queue, parsed);
    })(), () => connection.disconnect());
    if (parsed.command !== "inspect") logger.info({ event: "jobs_control_applied", actor: userInfo().username, command: parsed.command, reason: parsed.reason ?? "planned-maintenance", jobId: parsed.id });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    connection.disconnect();
    await controlDeadline(queue.close(), () => connection.disconnect());
  }
}

if (require.main === module) {
  void runControl(process.argv.slice(2)).catch(() => {
    process.stderr.write('{"event":"jobs_control_failed","reasonCode":"CHECK_ARGUMENTS_JOB_STATE_OR_CONNECTION; MUTATION_ACK_MAY_BE_UNKNOWN"}\n');
    process.exitCode = 1;
  });
}
