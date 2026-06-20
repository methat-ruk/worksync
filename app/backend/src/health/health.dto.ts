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
