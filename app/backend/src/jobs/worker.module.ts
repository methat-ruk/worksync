import { Module, type DynamicModule } from "@nestjs/common";
import pino from "pino";
import type { JobsConfig } from "./jobs.config";
import { JobsRuntime } from "./jobs.runtime";

@Module({})
export class WorkerModule {
  static register(config: JobsConfig): DynamicModule {
    return { module: WorkerModule, providers: [{
      provide: JobsRuntime,
      useFactory: () => new JobsRuntime(config, pino({ level: config.logLevel, base: { component: "jobs" } }))
    }], exports: [JobsRuntime] };
  }
}
