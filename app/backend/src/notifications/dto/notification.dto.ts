import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ListNotificationsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_024)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class PublicNotificationActorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class PublicNotificationWorkspaceDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class PublicNotificationProjectDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  key!: string;

  @ApiProperty()
  name!: string;
}

export class PublicNotificationTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;
}

export class PublicNotificationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ["COMMENT_MENTION"] })
  type!: "COMMENT_MENTION";

  @ApiProperty({ format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ format: "date-time", nullable: true })
  readAt!: Date | null;

  @ApiProperty({ type: PublicNotificationActorDto })
  actor!: PublicNotificationActorDto;

  @ApiProperty({ type: PublicNotificationWorkspaceDto })
  workspace!: PublicNotificationWorkspaceDto;

  @ApiProperty({ type: PublicNotificationProjectDto })
  project!: PublicNotificationProjectDto;

  @ApiProperty({ type: PublicNotificationTaskDto })
  task!: PublicNotificationTaskDto;
}

export class NotificationListDataDto {
  @ApiProperty({ type: PublicNotificationDto, isArray: true })
  items!: PublicNotificationDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;

  @ApiProperty({ minimum: 0 })
  unreadCount!: number;
}

export class NotificationListResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiProperty({ type: NotificationListDataDto })
  data!: NotificationListDataDto;
}

export class MarkNotificationReadDataDto {
  @ApiProperty({ type: PublicNotificationDto })
  notification!: PublicNotificationDto;

  @ApiProperty({ minimum: 0 })
  unreadCount!: number;
}

export class MarkNotificationReadResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiPropertyOptional()
  message?: string;

  @ApiProperty({ type: MarkNotificationReadDataDto })
  data!: MarkNotificationReadDataDto;
}

export class MarkAllNotificationsReadDataDto {
  @ApiProperty({ format: "date-time" })
  readAt!: Date;

  @ApiProperty({ minimum: 0 })
  updatedCount!: number;

  @ApiProperty({ minimum: 0 })
  unreadCount!: number;
}

export class MarkAllNotificationsReadResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiPropertyOptional()
  message?: string;

  @ApiProperty({ type: MarkAllNotificationsReadDataDto })
  data!: MarkAllNotificationsReadDataDto;
}
