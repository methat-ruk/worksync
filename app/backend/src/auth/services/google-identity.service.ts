import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service";
import {
  AuthProvider,
  Prisma
} from "../../generated/prisma/client";
import { GoogleOAuthError } from "../errors/google-oauth.error";
import type {
  GoogleIdentityProfile
} from "../types/google-oauth.types";
import type { PublicUser } from "../types/auth.types";
import {
  SessionService,
  type SessionAuthentication
} from "./session.service";

const GOOGLE_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

type GoogleUser = Prisma.UserGetPayload<{
  select: typeof GOOGLE_USER_SELECT;
}>;

function publicUser(user: GoogleUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function isAuthoritativeGoogleEmail(
  profile: GoogleIdentityProfile
): boolean {
  return (
    profile.email.endsWith("@gmail.com") ||
    Boolean(profile.hostedDomain?.trim())
  );
}

@Injectable()
export class GoogleIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService
  ) {}

  async authenticate(
    profile: GoogleIdentityProfile,
    userAgent: string | undefined
  ): Promise<SessionAuthentication> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          return this.authenticateInTransaction(
            transaction,
            profile,
            userAgent
          );
        });
      } catch (error: unknown) {
        if (
          attempt === 0 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new GoogleOAuthError("IDENTITY_CONFLICT");
        }
        throw error;
      }
    }
    throw new GoogleOAuthError("IDENTITY_CONFLICT");
  }

  private async authenticateInTransaction(
    transaction: Prisma.TransactionClient,
    profile: GoogleIdentityProfile,
    userAgent: string | undefined
  ): Promise<SessionAuthentication> {
    const existingIdentity = await transaction.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: AuthProvider.GOOGLE,
          providerSubject: profile.subject
        }
      },
      select: {
        id: true,
        providerEmail: true,
        user: { select: GOOGLE_USER_SELECT }
      }
    });
    if (existingIdentity) {
      if (existingIdentity.providerEmail !== profile.email) {
        await transaction.authIdentity.update({
          where: { id: existingIdentity.id },
          data: { providerEmail: profile.email }
        });
      }
      return this.sessions.create(
        publicUser(existingIdentity.user),
        userAgent,
        transaction
      );
    }

    let user = await transaction.user.findUnique({
      where: { email: profile.email },
      select: GOOGLE_USER_SELECT
    });
    if (user && !isAuthoritativeGoogleEmail(profile)) {
      throw new GoogleOAuthError("NON_AUTHORITATIVE_EMAIL_CONFLICT");
    }
    user ??= await transaction.user.create({
      data: {
        email: profile.email,
        displayName: profile.displayName,
        passwordHash: null
      },
      select: GOOGLE_USER_SELECT
    });

    await transaction.authIdentity.create({
      data: {
        userId: user.id,
        provider: AuthProvider.GOOGLE,
        providerSubject: profile.subject,
        providerEmail: profile.email
      }
    });

    return this.sessions.create(publicUser(user), userAgent, transaction);
  }
}
