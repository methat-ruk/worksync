import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ListAttachmentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_024)
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class PublicAttachmentCreatorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class PublicAttachmentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  filename!: string;

  @ApiProperty({ description: "Authoritative byte size" })
  size!: number;

  @ApiProperty({ enum: ["image/png", "image/jpeg"] })
  contentType!: string;

  @ApiProperty({ enum: ["AVAILABLE", "DELETE_FAILED"] })
  status!: "AVAILABLE" | "DELETE_FAILED";

  @ApiProperty({ type: PublicAttachmentCreatorDto, nullable: true })
  creator!: PublicAttachmentCreatorDto | null;

  @ApiProperty({ format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt!: Date;
}

export class AttachmentDataDto {
  @ApiProperty({ type: PublicAttachmentDto })
  attachment!: PublicAttachmentDto;
}

export class AttachmentResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiPropertyOptional()
  message?: string;

  @ApiProperty({ type: AttachmentDataDto })
  data!: AttachmentDataDto;
}

export class AttachmentListDataDto {
  @ApiProperty({ type: PublicAttachmentDto, isArray: true })
  items!: PublicAttachmentDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}

export class AttachmentListResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiProperty({ type: AttachmentListDataDto })
  data!: AttachmentListDataDto;
}
