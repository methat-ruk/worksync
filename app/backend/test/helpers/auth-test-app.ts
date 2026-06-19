import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma, type User } from "@prisma/client";

import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/database/prisma.service";
import { configureApplication } from "../../src/main";

type StoredUser = User;

export type AuthTestContext = {
  app: INestApplication;
  users: Map<string, StoredUser>;
};

export async function createAuthTestApp(): Promise<AuthTestContext> {
  const users = new Map<string, StoredUser>();
  let sequence = 0;

  const prisma = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
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

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApplication(app);
  await app.init();

  return { app, users };
}
