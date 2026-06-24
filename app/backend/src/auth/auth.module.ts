import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { OAuth2Client } from "google-auth-library";

import type { Environment } from "../config/environment";
import { ObservabilityModule } from "../observability/observability.module";
import { AuthController } from "./controllers/auth.controller";
import { AuthGuard } from "./guards/auth.guard";
import { AuthOriginGuard } from "./guards/auth-origin.guard";
import { AccessTokenService } from "./services/access-token.service";
import { AuthService } from "./services/auth.service";
import { GoogleIdentityService } from "./services/google-identity.service";
import {
  GOOGLE_OAUTH_CLIENT,
  GOOGLE_OAUTH_FETCH,
  GoogleOAuthProviderService
} from "./services/google-oauth-provider.service";
import { GoogleOAuthService } from "./services/google-oauth.service";
import { GoogleOAuthTransactionService } from "./services/google-oauth-transaction.service";
import { PasswordHasher } from "./services/password-hasher.service";
import { PasswordPolicyService } from "./services/password-policy.service";
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
    PasswordPolicyService,
    AccessTokenService,
    RefreshTokenService,
    SessionCookieService,
    SessionService,
    GoogleOAuthTransactionService,
    GoogleOAuthProviderService,
    GoogleIdentityService,
    GoogleOAuthService,
    {
      provide: GOOGLE_OAUTH_CLIENT,
      useFactory: () => new OAuth2Client()
    },
    {
      provide: GOOGLE_OAUTH_FETCH,
      useValue: globalThis.fetch.bind(globalThis)
    }
  ],
  exports: [AuthGuard]
})
export class AuthModule {}
