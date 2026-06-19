import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { PrismaService } from "../database/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { CorrelationContextService } from "../observability/correlation-context.service";
import { AccessTokenService } from "./access-token.service";
import type {
  AuthDataDto,
  LoginRequestDto,
  SignUpRequestDto
} from "./auth.dto";
import { normalizeEmail } from "./auth.dto";
import type { PublicUser } from "./auth.types";
import { PasswordHasher } from "./password-hasher.service";

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

type AuthUser = Prisma.UserGetPayload<{ select: typeof AUTH_USER_SELECT }>;
type LoginFailureReason =
  | "USER_NOT_FOUND"
  | "PASSWORD_HASH_MISSING"
  | "PASSWORD_MISMATCH";

function toPublicUser(user: AuthUser | PublicUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly accessTokens: AccessTokenService,
    private readonly logger: PinoLogger,
    private readonly correlationContext: CorrelationContextService
  ) {
    this.logger.setContext(AuthService.name);
  }

  async signUp(input: SignUpRequestDto): Promise<AuthDataDto> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.passwordHasher.hash(input.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          displayName: input.displayName.trim(),
          passwordHash
        },
        select: AUTH_USER_SELECT
      });
      return this.createAuthData(user);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          message: "An account with this email already exists",
          code: "AUTH_EMAIL_CONFLICT"
        });
      }

      throw error;
    }
  }

  async login(input: LoginRequestDto): Promise<AuthDataDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(input.email) },
      select: AUTH_USER_SELECT
    });
    const valid = await this.passwordHasher.verifyWithDummy(
      input.password,
      user?.passwordHash
    );

    if (!user || !valid) {
      const reasonCode: LoginFailureReason = !user
        ? "USER_NOT_FOUND"
        : !user.passwordHash
          ? "PASSWORD_HASH_MISSING"
          : "PASSWORD_MISMATCH";
      const correlationId = this.correlationContext.getCorrelationId();
      this.logger.warn(
        {
          reasonCode,
          ...(correlationId ? { correlationId } : {})
        },
        "Password login failed"
      );
      throw new UnauthorizedException({
        message: "Invalid email or password",
        code: "INVALID_CREDENTIALS"
      });
    }

    return this.createAuthData(user);
  }

  async findPublicUserById(userId: string): Promise<PublicUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_USER_SELECT
    });
    return user ? toPublicUser(user) : null;
  }

  private async createAuthData(user: AuthUser): Promise<AuthDataDto> {
    const token = await this.accessTokens.issue(user.id);
    return {
      user: toPublicUser(user),
      ...token
    };
  }
}
