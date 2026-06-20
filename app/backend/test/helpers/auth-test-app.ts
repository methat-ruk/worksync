import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma.service";
import {
  Prisma,
  type AuthSession,
  type User
} from "../../src/generated/prisma/client";
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
  users: Map<string, StoredUser>;
  sessions: Map<string, AuthSession>;
};

export async function createAuthTestApp(): Promise<AuthTestContext> {
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
    user: {
      create: jest.fn(
        ({
          data
        }: {
          data: {
            email: string;
            displayName: string;
            passwordHash: string;
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

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApplication(app);
  await app.init();

  return { app, users, sessions };
}
