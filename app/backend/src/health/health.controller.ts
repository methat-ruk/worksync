import { Controller, Get } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";

import {
  ErrorResponseDto,
  HealthResponseDto,
  ReadinessResponseDto
} from "./health.dto";
import { HealthService } from "./health.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: "Compatibility liveness check" })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): HealthResponseDto {
    return this.healthService.getLiveness();
  }

  @Get("live")
  @ApiOperation({ summary: "Process liveness check" })
  @ApiOkResponse({ type: HealthResponseDto })
  getLiveness(): HealthResponseDto {
    return this.healthService.getLiveness();
  }

  @Get("ready")
  @ApiOperation({ summary: "Service readiness check" })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiResponse({
    status: 503,
    description: "PostgreSQL is unavailable",
    type: ErrorResponseDto
  })
  getReadiness(): Promise<ReadinessResponseDto> {
    return this.healthService.getReadiness();
  }
}
