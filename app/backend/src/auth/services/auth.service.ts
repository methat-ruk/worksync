import {
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import { PrismaService } from "../../database/prisma.service";
import { Prisma } from "../../generated/prisma/client";
import { CorrelationContextService } from "../../observability/correlation-context.service";
import type {
  LoginRequestDto,
  SignUpRequestDto
} from "../dto/auth.dto";
import { normalizeEmail } from "../dto/auth.dto";
import type { PublicUser } from "../types/auth.types";
import { PasswordHasher } from "./password-hasher.service";
import {
  SessionService,
  type SessionAuthentication
} from "./session.service";

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
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
    private readonly sessions: SessionService,
    private readonly logger: PinoLogger,
    private readonly correlationContext: CorrelationContextService
  ) {
    this.logger.setContext(AuthService.name);
  }

  async signUp(
    input: SignUpRequestDto,
    userAgent: string | undefined
  ): Promise<SessionAuthentication> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.passwordHasher.hash(input.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email,
            displayName: input.displayName.trim(),
            passwordHash
          },
          select: AUTH_USER_SELECT
        });
        return this.sessions.create(
          toPublicUser(user),
          userAgent,
          transaction
        );
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          message: "An account with this email already exists",
          code: API_ERROR_CODE.AUTH_EMAIL_CONFLICT
        });
      }

      throw error;
    }
  }

  async login(
    input: LoginRequestDto,
    userAgent: string | undefined
  ): Promise<SessionAuthentication> {
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
        code: API_ERROR_CODE.INVALID_CREDENTIALS
      });
    }

    return this.sessions.create(toPublicUser(user), userAgent);
  }
}
