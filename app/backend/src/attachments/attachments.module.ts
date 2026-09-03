import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AttachmentRateLimiterService } from "./attachment-rate-limiter.service";
import { AttachmentReconciliationService } from "./attachment-reconciliation.service";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { S3StorageService } from "./storage/s3-storage.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentRateLimiterService,
    AttachmentReconciliationService,
    S3StorageService
  ],
  exports: [
    AttachmentsService,
    AttachmentReconciliationService,
    S3StorageService
  ]
})
export class AttachmentsModule {}
