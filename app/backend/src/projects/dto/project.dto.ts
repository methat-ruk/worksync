import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeProjectKey({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim().toUpperCase() : value;
}

const MAX_PROJECT_PAGE = 10_000;

export class CreateProjectRequestDto {
  @ApiProperty({ example: "WorkSync", minLength: 1, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({
    example: "WSYNC",
    minLength: 2,
    maxLength: 10,
    pattern: "^[A-Z][A-Z0-9]{1,9}$"
  })
  @Transform(normalizeProjectKey)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/)
  key!: string;
}

export class UpdateProjectRequestDto {
  @ApiProperty({ example: "WorkSync Platform", minLength: 1, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  name!: string;
}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
    maximum: MAX_PROJECT_PAGE
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PROJECT_PAGE)
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

export class PublicProjectDto {
  @ApiProperty({ example: "cm1234567890" })
  id!: string;

  @ApiProperty({ example: "WorkSync" })
  name!: string;

  @ApiProperty({ example: "WSYNC" })
  key!: string;

  @ApiProperty({ example: "2026-07-30T10:00:00.000Z", format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-07-30T10:00:00.000Z", format: "date-time" })
  updatedAt!: Date;
}

export class ProjectDataDto {
  @ApiProperty({ type: PublicProjectDto })
  project!: PublicProjectDto;
}

export class ProjectResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: "Project created", required: false })
  message?: string;

  @ApiProperty({ type: ProjectDataDto })
  data!: ProjectDataDto;
}

export class ProjectListDataDto {
  @ApiProperty({ type: PublicProjectDto, isArray: true })
  items!: PublicProjectDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;
}

export class ProjectListResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ type: ProjectListDataDto })
  data!: ProjectListDataDto;
}
