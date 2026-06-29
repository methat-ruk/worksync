import { ServiceUnavailableException } from "@nestjs/common";

import type { PrismaService } from "../../src/database/prisma.service";
import { HealthService } from "../../src/health/health.service";

describe("HealthService", () => {
  const prisma = {
    $queryRaw: jest.fn()
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports liveness without checking dependencies", () => {
    const service = new HealthService(prisma);

    expect(service.getLiveness()).toEqual({
      success: true,
      data: { status: "ok", service: "worksync-backend" }
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("reports readiness when PostgreSQL responds", async () => {
    jest.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    const service = new HealthService(prisma);

    await expect(service.getReadiness()).resolves.toEqual({
      success: true,
      data: {
        status: "ok",
        service: "worksync-backend",
        database: "up"
      }
    });
  });

  it("returns a service unavailable error when PostgreSQL fails", async () => {
    jest.mocked(prisma.$queryRaw).mockRejectedValue(new Error("connection failed"));
    const service = new HealthService(prisma);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
