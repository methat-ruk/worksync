import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../database/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  TaskAssigneesController,
  TasksController
} from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [AuthModule, PrismaModule, WorkspacesModule, ProjectsModule],
  controllers: [TasksController, TaskAssigneesController],
  providers: [TasksService],
  exports: [TasksService]
})
export class TasksModule {}
