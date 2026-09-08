import { NestFactory } from "@nestjs/core";
import { parseJobsConfig } from "./jobs/jobs.config";
import { JobsRuntime } from "./jobs/jobs.runtime";
import { WorkerModule } from "./jobs/worker.module";

export async function bootstrapWorker(): Promise<void> {
  const config = parseJobsConfig(process.env);
  const app = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false, abortOnError: false });
  const runtime = app.get(JobsRuntime);
  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    stopping ??= (async () => {
      const force = setTimeout(() => { process.exitCode = 1; runtime.forceClose(); }, 20000);
      const deadline = setTimeout(() => process.exit(1), 30000);
      try { await runtime.stop(); await app.close(); }
      finally { clearTimeout(force); clearTimeout(deadline); }
    })();
    return stopping;
  }
  const signal = () => { void stop().catch(() => { process.exitCode = 1; runtime.forceClose(); }); };
  process.on("SIGTERM", signal); process.on("SIGINT", signal);
  try { await runtime.start(); }
  catch { process.exitCode = 1; await stop(); throw new Error("WORKER_START_FAILED"); }
}

if (require.main === module) {
  void bootstrapWorker().catch(() => {
    process.stderr.write('{"level":"fatal","event":"worker_start_failed","reasonCode":"CHECK_JOBS_CONFIGURATION_AND_DEPENDENCIES"}\n');
    process.exitCode = 1;
  });
}
