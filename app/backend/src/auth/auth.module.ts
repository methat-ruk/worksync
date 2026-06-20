import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import type { Environment } from "../config/environment";
import { ObservabilityModule } from "../observability/observability.module";
import { AuthController } from "./controllers/auth.controller";
import { AuthGuard } from "./guards/auth.guard";
import { AuthOriginGuard } from "./guards/auth-origin.guard";
import { AccessTokenService } from "./services/access-token.service";
import { AuthService } from "./services/auth.service";
import { PasswordHasher } from "./services/password-hasher.service";
import { RefreshTokenService } from "./services/refresh-token.service";
import { SessionCookieService } from "./services/session-cookie.service";
import { SessionService } from "./services/session.service";

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
    AuthOriginGuard,
    PasswordHasher,
    AccessTokenService,
    RefreshTokenService,
    SessionCookieService,
    SessionService
  ],
  exports: [AuthGuard]
})
export class AuthModule {}
