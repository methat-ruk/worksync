import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { ConfigurationModule } from "./config/configuration.module";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [
    ConfigurationModule,
    ObservabilityModule,
    PrismaModule,
    HealthModule,
    AuthModule
  ]
})
export class AppModule {}
