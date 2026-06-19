import { ConfigService } from "@nestjs/config";

import type { Environment } from "../../src/config/environment";
import { PrismaService } from "../../src/database/prisma.service";

const describeWithDatabase = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

describeWithDatabase("PrismaService integration", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const config = new ConfigService<Environment, true>({
      DATABASE_URL: process.env.TEST_DATABASE_URL
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
