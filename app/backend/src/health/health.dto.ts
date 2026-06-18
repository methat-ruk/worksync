import { ApiProperty } from "@nestjs/swagger";

export class HealthStatusDto {
  @ApiProperty({ example: "ok", enum: ["ok"] })
  status!: "ok";

  @ApiProperty({ example: "worksync-backend" })
  service!: "worksync-backend";
}

export class HealthResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ type: HealthStatusDto })
  data!: HealthStatusDto;
}

export class ReadinessStatusDto extends HealthStatusDto {
  @ApiProperty({ example: "up", enum: ["up"] })
  database!: "up";
}

export class ReadinessResponseDto {
  @ApiProperty({ example: true, enum: [true] })
  success!: true;

  @ApiProperty({ type: ReadinessStatusDto })
  data!: ReadinessStatusDto;
}

class ErrorDataDto {
  @ApiProperty({ example: "SERVICE_NOT_READY", required: false })
  code?: string;

  @ApiProperty({ example: "0f877824-8e57-45ef-b2e0-c10ee9d2e022", required: false })
  correlationId?: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false, enum: [false] })
  success!: false;

  @ApiProperty({ example: "Service is not ready" })
  message!: string;

  @ApiProperty({ type: ErrorDataDto, required: false })
  data?: ErrorDataDto;
}
