import { ConfigService } from "@nestjs/config";

import type { Environment } from "../../src/config/environment";
import { PrismaService } from "../../src/database/prisma.service";

describe("PrismaService integration", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required for Prisma integration");
    }
    const config = new ConfigService<Environment, true>({
      DATABASE_URL: databaseUrl
    } as Environment);
    prisma = new PrismaService(config);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.beforeApplicationShutdown();
  });

  it("connects to PostgreSQL and executes a readiness query", async () => {
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeDefined();
  });
});
