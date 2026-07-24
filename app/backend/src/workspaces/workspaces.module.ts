import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../database/prisma.module";
import { WorkspaceAuthorizationService } from "./workspace-authorization.service";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [WorkspacesController],
  providers: [WorkspaceAuthorizationService, WorkspacesService],
  exports: [WorkspaceAuthorizationService, WorkspacesService]
})
export class WorkspacesModule {}
