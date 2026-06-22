import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma.service";
import {
  Prisma,
  type AuthIdentity,
  type AuthProvider,
  type AuthSession,
  type User
} from "../../src/generated/prisma/client";
import { GoogleOAuthProviderService } from "../../src/auth/services/google-oauth-provider.service";
import { GoogleOAuthError } from "../../src/auth/errors/google-oauth.error";
import type { GoogleIdentityProfile } from "../../src/auth/types/google-oauth.types";
import type { PublicUser } from "../../src/auth/types/auth.types";
import { configureApplication } from "../../src/main";

type StoredUser = User;

function publicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export type AuthTestContext = {
  app: INestApplication;
  identities: Map<string, AuthIdentity>;
  users: Map<string, StoredUser>;
  sessions: Map<string, AuthSession>;
};

export type AuthTestOptions = {
  googleProfile?: GoogleIdentityProfile;
  googleFailure?: Error;
};

export async function createAuthTestApp(
  options: AuthTestOptions = {}
): Promise<AuthTestContext> {
  const identities = new Map<string, AuthIdentity>();
  const users = new Map<string, StoredUser>();
  const sessions = new Map<string, AuthSession>();
  let sequence = 0;

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    authSession: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            id: string;
            userId: string;
            refreshTokenHash: string;
            userAgent: string | null;
            expiresAt: Date;
          };
        }): AuthSession => {
          const now = new Date();
          const session: AuthSession = {
            id: data.id,
            userId: data.userId,
            refreshTokenHash: data.refreshTokenHash,
            userAgent: data.userAgent,
            expiresAt: data.expiresAt,
            lastUsedAt: now,
            revokedAt: null,
            createdAt: now,
            updatedAt: now
          };
          sessions.set(session.id, session);
          return session;
        }
      ),
      findUnique: jest.fn(
        ({
          where
        }: {
          where: { id: string };
        }) => {
          const session = sessions.get(where.id);
          if (!session) {
            return null;
          }
          const user = users.get(session.userId);
          return user ? { ...session, user: publicUser(user) } : null;
        }
      ),
      findFirst: jest.fn(
        ({
          where
        }: {
          where: {
            id: string;
            userId: string;
            revokedAt: null;
            expiresAt: { gt: Date };
          };
        }) => {
          const session = sessions.get(where.id);
          const user = session ? users.get(session.userId) : undefined;
          if (
            !session ||
            !user ||
            session.userId !== where.userId ||
            session.revokedAt ||
            session.expiresAt <= where.expiresAt.gt
          ) {
            return null;
          }
          return { user: publicUser(user) };
        }
      ),
      updateMany: jest.fn(
        ({
          where,
          data
        }: {
          where: {
            id?: string;
            userId?: string;
            refreshTokenHash?: string;
            revokedAt?: null;
            expiresAt?: { gt: Date };
          };
          data: Partial<AuthSession>;
        }) => {
          let count = 0;
          for (const [id, session] of sessions) {
            if (
              (where.id && session.id !== where.id) ||
              (where.userId && session.userId !== where.userId) ||
              (where.refreshTokenHash &&
                session.refreshTokenHash !== where.refreshTokenHash) ||
              (where.revokedAt === null && session.revokedAt !== null) ||
              (where.expiresAt && session.expiresAt <= where.expiresAt.gt)
            ) {
              continue;
            }
            sessions.set(id, {
              ...session,
              ...data,
              updatedAt: new Date()
            });
            count += 1;
          }
          return { count };
        }
      )
    },
    authIdentity: {
      findUnique: jest.fn(
        ({
          where
        }: {
          where: {
            provider_providerSubject: {
              provider: AuthProvider;
              providerSubject: string;
            };
          };
        }) => {
          const identity = [...identities.values()].find(
            (candidate) =>
              candidate.provider ===
                where.provider_providerSubject.provider &&
              candidate.providerSubject ===
                where.provider_providerSubject.providerSubject
          );
          if (!identity) {
            return null;
          }
          const user = users.get(identity.userId);
          return user ? { ...identity, user } : null;
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: { providerEmail: string };
        }) => {
          const identity = identities.get(where.id);
          if (!identity) {
            throw new Error("Identity not found");
          }
          const updated = {
            ...identity,
            ...data,
            updatedAt: new Date()
          };
          identities.set(updated.id, updated);
          return updated;
        }
      ),
      create: jest.fn(
        ({
          data
        }: {
          data: {
            userId: string;
            provider: AuthProvider;
            providerSubject: string;
            providerEmail: string;
          };
        }) => {
          const duplicate = [...identities.values()].some(
            (identity) =>
              (identity.provider === data.provider &&
                identity.providerSubject === data.providerSubject) ||
              (identity.userId === data.userId &&
                identity.provider === data.provider)
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
                code: "P2002",
                clientVersion: "7.8.0"
              }
            );
          }
          const now = new Date();
          const identity: AuthIdentity = {
            id: `identity-${++sequence}`,
            ...data,
            createdAt: now,
            updatedAt: now
          };
          identities.set(identity.id, identity);
          return identity;
        }
      )
    },
    user: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            email: string;
            displayName: string;
            passwordHash: string | null;
          };
        }) => {
          if ([...users.values()].some((user) => user.email === data.email)) {
            throw new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              {
              code: "P2002",
              clientVersion: "5.22.0",
              meta: { target: ["email"] }
              }
            );
          }

          const now = new Date("2026-06-19T10:00:00.000Z");
          const user: StoredUser = {
            id: `user-${++sequence}`,
            email: data.email,
            displayName: data.displayName,
            passwordHash: data.passwordHash,
            createdAt: now,
            updatedAt: now
          };
          users.set(user.id, user);
          return user;
        }
      ),
      findUnique: jest.fn(
        ({
          where
        }: {
          where: { id?: string; email?: string };
        }): StoredUser | null => {
          if (where.id) {
            return users.get(where.id) ?? null;
          }
          return (
            [...users.values()].find((user) => user.email === where.email) ??
            null
          );
        }
      )
    }
  };
  Object.assign(prisma, {
    $transaction: jest.fn(
      async (callback: (transaction: typeof prisma) => unknown) =>
        callback(prisma)
    )
  });

  const usedGoogleCodes = new Set<string>();
  const googleProvider = {
    authorizationUrl: jest.fn(
      (transaction: { state: string }) =>
        `https://accounts.google.test/authorize?state=${encodeURIComponent(transaction.state)}`
    ),
    authenticate: jest.fn(async (code: string) => {
      if (options.googleFailure) {
        throw options.googleFailure;
      }
      if (usedGoogleCodes.has(code)) {
        throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
      }
      usedGoogleCodes.add(code);
      if (!options.googleProfile) {
        throw new Error("Google profile is not configured for this test");
      }
      return options.googleProfile;
    })
  };
  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule]
  }).overrideProvider(PrismaService).useValue(prisma);
  if (options.googleProfile || options.googleFailure) {
    moduleBuilder
      .overrideProvider(GoogleOAuthProviderService)
      .useValue(googleProvider);
  }
  const moduleRef = await moduleBuilder.compile();

  const app = moduleRef.createNestApplication();
  configureApplication(app);
  await app.init();

  return { app, identities, users, sessions };
}
