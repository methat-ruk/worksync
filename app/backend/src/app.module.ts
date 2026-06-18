import { Module } from "@nestjs/common";

import { ConfigurationModule } from "./config/configuration.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    PrismaModule,
    HealthModule
  ]
})
export class AppModule {}
