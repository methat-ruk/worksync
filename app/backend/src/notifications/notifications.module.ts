import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../database/prisma.module";
import { NotificationPersistenceService } from "./notification-persistence.service";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationPersistenceService, NotificationsService],
  exports: [NotificationPersistenceService]
})
export class NotificationsModule {}
