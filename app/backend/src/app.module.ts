import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { AttachmentsModule } from "./attachments/attachments.module";
import { ConfigurationModule } from "./config/configuration.module";
import { CommentsModule } from "./comments/comments.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
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
    AttachmentsModule,
    WorkspacesModule,
    ProjectsModule,
    TasksModule,
    NotificationsModule,
    CommentsModule
  ]
})
export class AppModule {}
