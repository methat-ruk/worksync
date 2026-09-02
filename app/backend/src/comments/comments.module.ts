import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../database/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  CommentsController,
  MentionCandidatesController
} from "./comments.controller";
import { CommentsService } from "./comments.service";

@Module({
  imports: [AuthModule, PrismaModule, WorkspacesModule, NotificationsModule],
  controllers: [CommentsController, MentionCandidatesController],
  providers: [CommentsService],
  exports: [CommentsService]
})
export class CommentsModule {}
