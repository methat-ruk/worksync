import { Transform, Type } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Max,
  Min
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { WorkspaceRole } from "../../generated/prisma/client";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeEmail({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export class CreateWorkspaceRequestDto {
  @ApiProperty({ example: "Product Team", minLength: 1, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class ListWorkspacesQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class PublicWorkspaceDto {
  @ApiProperty({ example: "cm1234567890" })
  id!: string;

  @ApiProperty({ example: "Product Team" })
  name!: string;

  @ApiProperty({ example: "product-team" })
  slug!: string;

  @ApiProperty({ example: "2026-07-06T10:00:00.000Z", format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-07-06T10:00:00.000Z", format: "date-time" })
  updatedAt!: Date;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.OWNER })
  membershipRole!: WorkspaceRole;
}

export class WorkspaceDataDto {
  @ApiProperty({ type: PublicWorkspaceDto })
  workspace!: PublicWorkspaceDto;
}

export class WorkspaceResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: "Workspace created", required: false })
  message?: string;

  @ApiProperty({ type: WorkspaceDataDto })
  data!: WorkspaceDataDto;
}

export class WorkspaceListDataDto {
  @ApiProperty({ type: PublicWorkspaceDto, isArray: true })
  items!: PublicWorkspaceDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;
}

export class WorkspaceListResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ type: WorkspaceListDataDto })
  data!: WorkspaceListDataDto;
}

export class ListWorkspaceMembersQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class AddWorkspaceMemberRequestDto {
  @ApiProperty({ example: "ada@example.com", format: "email" })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class UpdateWorkspaceMemberRequestDto {
  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class PublicWorkspaceMemberDto {
  @ApiProperty({ example: "cm1234567890" })
  id!: string;

  @ApiProperty({ example: "cm0987654321" })
  userId!: string;

  @ApiProperty({ example: "ada@example.com", format: "email" })
  email!: string;

  @ApiProperty({ example: "Ada Lovelace" })
  displayName!: string;

  @ApiProperty({ enum: WorkspaceRole, example: WorkspaceRole.MEMBER })
  role!: WorkspaceRole;

  @ApiProperty({ example: "2026-07-06T10:00:00.000Z", format: "date-time" })
  createdAt!: Date;
}

export class WorkspaceMemberDataDto {
  @ApiProperty({ type: PublicWorkspaceMemberDto })
  member!: PublicWorkspaceMemberDto;
}

export class WorkspaceMemberResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: "Workspace member added", required: false })
  message?: string;

  @ApiProperty({ type: WorkspaceMemberDataDto })
  data!: WorkspaceMemberDataDto;
}

export class WorkspaceMemberListDataDto {
  @ApiProperty({ type: PublicWorkspaceMemberDto, isArray: true })
  items!: PublicWorkspaceMemberDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;
}

export class WorkspaceMemberListResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ type: WorkspaceMemberListDataDto })
  data!: WorkspaceMemberListDataDto;
}

export class WorkspaceMemberMessageResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: "Workspace member removed" })
  message!: string;
}
