import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import type { Environment } from "../config/environment";
import { ObservabilityModule } from "../observability/observability.module";
import { AccessTokenService } from "./access-token.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PasswordHasher } from "./password-hasher.service";

@Module({
  imports: [
    ObservabilityModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        verifyOptions: { algorithms: ["HS256"] }
      })
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    PasswordHasher,
    AccessTokenService
  ],
  exports: [AuthGuard]
})
export class AuthModule {}
