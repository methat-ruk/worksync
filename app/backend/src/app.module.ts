import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { ConfigurationModule } from "./config/configuration.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { ObservabilityModule } from "./observability/observability.module";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule
  ]
})
export class AppModule {}
