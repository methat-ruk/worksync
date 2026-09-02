import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";

import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthGuard } from "../auth/guards/auth.guard";
import type { PublicUser } from "../auth/types/auth.types";
import { ApiErrorResponseDto } from "../common/errors/api-error.dto";
import {
  ListNotificationsQueryDto,
  MarkAllNotificationsReadResponseDto,
  MarkNotificationReadResponseDto,
  NotificationListResponseDto
} from "./dto/notification.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth("access-token")
@UseGuards(AuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's notifications" })
  @ApiOkResponse({ type: NotificationListResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  async list(
    @CurrentUser() user: PublicUser,
    @Query() query: ListNotificationsQueryDto
  ): Promise<NotificationListResponseDto> {
    return {
      success: true,
      data: await this.notifications.list(user.id, query)
    };
  }

  @Patch("read-all")
  @ApiOperation({ summary: "Mark all current notifications as read" })
  @ApiOkResponse({ type: MarkAllNotificationsReadResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async markAllRead(
    @CurrentUser() user: PublicUser
  ): Promise<MarkAllNotificationsReadResponseDto> {
    return {
      success: true,
      message: "Notifications marked as read",
      data: await this.notifications.markAllRead(user.id)
    };
  }

  @Patch(":notificationId/read")
  @ApiOperation({ summary: "Mark one notification as read" })
  @ApiOkResponse({ type: MarkNotificationReadResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async markRead(
    @CurrentUser() user: PublicUser,
    @Param("notificationId") notificationId: string
  ): Promise<MarkNotificationReadResponseDto> {
    return {
      success: true,
      message: "Notification marked as read",
      data: await this.notifications.markRead(user.id, notificationId)
    };
  }
}
