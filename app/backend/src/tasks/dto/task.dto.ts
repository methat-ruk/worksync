import {
  Transform,
  Type,
  type TransformFnParams
} from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { TaskStatus } from "../../generated/prisma/client";

const MAX_PAGE = 10_000;

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

type BooleanQueryLiteral = "false" | "true";

function isBooleanQueryLiteral(
  value: unknown
): value is BooleanQueryLiteral {
  return value === "true" || value === "false";
}

function coerceStrictBooleanQueryParameter({
  value
}: TransformFnParams): unknown {
  // Preserve unsupported literals so @IsBoolean reports validation feedback.
  return isBooleanQueryLiteral(value) ? value === "true" : value;
}

export class CreateTaskRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 200, example: "Ship task flow" })
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "cm1234567890" })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  assigneeId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    format: "date-time",
    example: "2026-08-07T10:00:00.000Z"
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string | null;
}

export class UpdateTaskRequestDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 200 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 5000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  assigneeId?: string | null;

  @ApiPropertyOptional({ nullable: true, format: "date-time" })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string | null;
}

export class TransitionTaskStatusRequestDto {
  @ApiProperty({ enum: TaskStatus, example: TaskStatus.IN_PROGRESS })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

export class ListTasksQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(coerceStrictBooleanQueryParameter)
  @IsBoolean()
  unassigned?: boolean;
}

export class SearchTaskAssigneesQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  search = "";

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: MAX_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export class PublicTaskUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class PublicTaskDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: TaskStatus })
  status!: TaskStatus;

  @ApiProperty({ nullable: true, format: "date-time" })
  dueDate!: Date | null;

  @ApiProperty({ type: PublicTaskUserDto })
  creator!: PublicTaskUserDto;

  @ApiProperty({ type: PublicTaskUserDto, nullable: true })
  assignee!: PublicTaskUserDto | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt!: Date;
}

export class TaskDataDto {
  @ApiProperty({ type: PublicTaskDto })
  task!: PublicTaskDto;
}

export class TaskResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiPropertyOptional()
  message?: string;

  @ApiProperty({ type: TaskDataDto })
  data!: TaskDataDto;
}

export class TaskListDataDto {
  @ApiProperty({ type: PublicTaskDto, isArray: true })
  items!: PublicTaskDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export class TaskListResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiProperty({ type: TaskListDataDto })
  data!: TaskListDataDto;
}

export class PublicTaskAssigneeDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class TaskAssigneeListDataDto {
  @ApiProperty({ type: PublicTaskAssigneeDto, isArray: true })
  items!: PublicTaskAssigneeDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export class TaskAssigneeListResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiProperty({ type: TaskAssigneeListDataDto })
  data!: TaskAssigneeListDataDto;
}
