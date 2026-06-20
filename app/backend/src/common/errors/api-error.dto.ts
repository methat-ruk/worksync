import { ApiProperty } from "@nestjs/swagger";

import { API_ERROR_CODE, type ApiErrorCode } from "./api-error-code";

export class ApiErrorDataDto {
  @ApiProperty({
    enum: Object.values(API_ERROR_CODE),
    example: API_ERROR_CODE.VALIDATION_ERROR,
    required: false
  })
  code?: ApiErrorCode;

  @ApiProperty({
    example: { email: ["email must be an email"] },
    required: false,
    type: Object,
    additionalProperties: { type: "array", items: { type: "string" } }
  })
  fields?: Record<string, string[]>;

  @ApiProperty({
    example: "0f877824-8e57-45ef-b2e0-c10ee9d2e022",
    required: false
  })
  correlationId?: string;
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false, enum: [false] })
  success!: false;

  @ApiProperty({ example: "Request failed" })
  message!: string;

  @ApiProperty({ type: ApiErrorDataDto, required: false })
  data?: ApiErrorDataDto;
}
