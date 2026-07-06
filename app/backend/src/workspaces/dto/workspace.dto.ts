import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { WorkspaceRole } from "../../generated/prisma/client";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
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
