import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  MAX_COMMENT_LENGTH,
  MAX_MENTION_OCCURRENCES
} from "../comment-contract";

export class CommentMentionInputDto {
  @ApiProperty()
  @IsString()
  @Length(1, 100)
  userId!: string;

  @ApiProperty({ minimum: 0, maximum: MAX_COMMENT_LENGTH })
  @IsInt()
  @Min(0)
  @Max(MAX_COMMENT_LENGTH)
  start!: number;

  @ApiProperty({ minimum: 1, maximum: MAX_COMMENT_LENGTH })
  @IsInt()
  @Min(1)
  @Max(MAX_COMMENT_LENGTH)
  end!: number;
}

export class CreateCommentRequestDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_COMMENT_LENGTH })
  @IsString()
  body!: string;

  @ApiProperty({ type: CommentMentionInputDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(MAX_MENTION_OCCURRENCES)
  @ValidateNested({ each: true })
  @Type(() => CommentMentionInputDto)
  mentions!: CommentMentionInputDto[];
}

export class ListCommentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1_024)
  cursor?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}

export class SearchMentionCandidatesQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value
  )
  @IsString()
  @Length(1, 100)
  search!: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit = 10;
}

export class PublicCommentAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;
}

export class PublicCommentMentionDto {
  @ApiProperty()
  start!: number;

  @ApiProperty()
  end!: number;
}

export class PublicCommentDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  taskId!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: PublicCommentAuthorDto })
  author!: PublicCommentAuthorDto;

  @ApiProperty({ type: PublicCommentMentionDto, isArray: true })
  mentions!: PublicCommentMentionDto[];

  @ApiProperty({ format: "date-time" })
  createdAt!: Date;
}

export class CommentDataDto {
  @ApiProperty({ type: PublicCommentDto })
  comment!: PublicCommentDto;
}

export class CommentResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiPropertyOptional()
  message?: string;

  @ApiProperty({ type: CommentDataDto })
  data!: CommentDataDto;
}

export class CommentListDataDto {
  @ApiProperty({ type: PublicCommentDto, isArray: true })
  items!: PublicCommentDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}

export class CommentListResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiProperty({ type: CommentListDataDto })
  data!: CommentListDataDto;
}

export class MentionCandidateDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  mentionLabel!: string;
}

export class MentionCandidateListDataDto {
  @ApiProperty({ type: MentionCandidateDto, isArray: true })
  items!: MentionCandidateDto[];
}

export class MentionCandidateListResponseDto {
  @ApiProperty({ enum: [true], example: true })
  success!: true;

  @ApiProperty({ type: MentionCandidateListDataDto })
  data!: MentionCandidateListDataDto;
}
