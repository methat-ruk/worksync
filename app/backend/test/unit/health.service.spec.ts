import { ServiceUnavailableException } from "@nestjs/common";
import type { PrismaHealthIndicator } from "@nestjs/terminus";

import type { PrismaService } from "../../src/database/prisma.service";
import { HealthService } from "../../src/health/health.service";

describe("HealthService", () => {
  const prisma = {} as PrismaService;

  it("reports liveness without checking dependencies", () => {
    const indicator = { pingCheck: jest.fn() } as unknown as PrismaHealthIndicator;
    const service = new HealthService(prisma, indicator);

    expect(service.getLiveness()).toEqual({
      success: true,
      data: { status: "ok", service: "worksync-backend" }
    });
    expect(indicator.pingCheck).not.toHaveBeenCalled();
  });

  it("reports readiness when PostgreSQL responds", async () => {
    const indicator = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: "up" } })
    } as unknown as PrismaHealthIndicator;
    const service = new HealthService(prisma, indicator);

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
    const indicator = {
      pingCheck: jest.fn().mockRejectedValue(new Error("connection failed"))
    } as unknown as PrismaHealthIndicator;
    const service = new HealthService(prisma, indicator);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
