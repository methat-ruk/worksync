import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaHealthIndicator } from "@nestjs/terminus";

import { PrismaService } from "../database/prisma.service";
import type {
  HealthResponseDto,
  ReadinessResponseDto
} from "./health.dto";

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prismaHealth: PrismaHealthIndicator
  ) {}

  getLiveness(): HealthResponseDto {
    return {
      success: true,
      data: {
        status: "ok",
        service: "worksync-backend"
      }
    };
  }

  async getReadiness(): Promise<ReadinessResponseDto> {
    try {
      await this.prismaHealth.pingCheck("database", this.prisma, {
        timeout: 1_000
      });
      return {
        success: true,
        data: {
          status: "ok",
          service: "worksync-backend",
          database: "up"
        }
      };
    } catch {
      throw new ServiceUnavailableException({
        message: "Service is not ready",
        code: "SERVICE_NOT_READY"
      });
    }
  }
}
