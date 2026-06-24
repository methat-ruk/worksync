import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  Length,
  MaxLength,
  MinLength
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PASSWORD_POLICY } from "@worksync/auth-policy/constants";

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
    minLength: PASSWORD_POLICY.minLength,
    maxLength: PASSWORD_POLICY.maxLength,
    description:
      "Must meet the shared password policy, including zxcvbn score 3 or higher and no leading or trailing whitespace",
    writeOnly: true
  })
  @IsString()
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
    minLength: PASSWORD_POLICY.minLength,
    maxLength: PASSWORD_POLICY.maxLength,
    writeOnly: true
  })
  @IsString()
  @MinLength(PASSWORD_POLICY.minLength)
  @MaxLength(PASSWORD_POLICY.maxLength)
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

export class AuthMessageResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ example: "Logged out" })
  message!: string;
}
