import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? value.trim() : value;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeEmailValue({ value }: { value: unknown }): unknown {
  return typeof value === "string" ? normalizeEmail(value) : value;
}

export class SignUpRequestDto {
  @ApiProperty({ example: "Ada Lovelace", minLength: 1, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @Length(1, 100)
  displayName!: string;

  @ApiProperty({ example: "ada@example.com", format: "email" })
  @Transform(normalizeEmailValue)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    example: "correct horse battery staple",
    minLength: 12,
    maxLength: 128,
    writeOnly: true
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class LoginRequestDto {
  @ApiProperty({ example: "ada@example.com", format: "email" })
  @Transform(normalizeEmailValue)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({
    example: "correct horse battery staple",
    minLength: 12,
    maxLength: 128,
    writeOnly: true
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class PublicUserDto {
  @ApiProperty({ example: "cm1234567890" })
  id!: string;

  @ApiProperty({ example: "ada@example.com", format: "email" })
  email!: string;

  @ApiProperty({ example: "Ada Lovelace" })
  displayName!: string;

  @ApiProperty({ example: "2026-06-19T10:00:00.000Z", format: "date-time" })
  createdAt!: Date;

  @ApiProperty({ example: "2026-06-19T10:00:00.000Z", format: "date-time" })
  updatedAt!: Date;
}

export class AuthDataDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty({ example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." })
  accessToken!: string;

  @ApiProperty({ example: "Bearer", enum: ["Bearer"] })
  tokenType!: "Bearer";

  @ApiProperty({ example: 900, description: "Access-token lifetime in seconds" })
  expiresIn!: number;
}

export class AuthResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: "Authentication successful" })
  message!: string;

  @ApiProperty({ type: AuthDataDto })
  data!: AuthDataDto;
}

export class CurrentUserDataDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;
}

export class CurrentUserResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ type: CurrentUserDataDto })
  data!: CurrentUserDataDto;
}

class AuthErrorDataDto {
  @ApiProperty({ example: "INVALID_CREDENTIALS", required: false })
  code?: string;

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

export class AuthErrorResponseDto {
  @ApiProperty({ example: false, enum: [false] })
  success!: false;

  @ApiProperty({ example: "Invalid email or password" })
  message!: string;

  @ApiProperty({ type: AuthErrorDataDto, required: false })
  data?: AuthErrorDataDto;
}
