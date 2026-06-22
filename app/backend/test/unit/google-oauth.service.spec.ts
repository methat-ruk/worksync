import { ConfigService } from "@nestjs/config";
import type { PinoLogger } from "nestjs-pino";

import { GoogleOAuthError } from "../../src/auth/errors/google-oauth.error";
import type { GoogleIdentityService } from "../../src/auth/services/google-identity.service";
import type { GoogleOAuthProviderService } from "../../src/auth/services/google-oauth-provider.service";
import { GoogleOAuthService } from "../../src/auth/services/google-oauth.service";
import type { GoogleOAuthTransactionService } from "../../src/auth/services/google-oauth-transaction.service";
import type { Environment } from "../../src/config/environment";
import type { CorrelationContextService } from "../../src/observability/correlation-context.service";

describe("GoogleOAuthService", () => {
  function createService(enabled: boolean) {
    const logger = {
      setContext: jest.fn(),
      warn: jest.fn()
    } as unknown as PinoLogger;
    const service = new GoogleOAuthService(
      new ConfigService<Environment, true>({
        FRONTEND_URL: "http://localhost:3000",
        GOOGLE_OAUTH_ENABLED: enabled
      }),
      {} as GoogleOAuthProviderService,
      {} as GoogleIdentityService,
      {} as GoogleOAuthTransactionService,
      logger,
      {
        getCorrelationId: () => "correlation-id"
      } as CorrelationContextService
    );
    return { logger, service };
  }

  it("fails closed with the public not-configured error when disabled", () => {
    const { service } = createService(false);

    expect(() => service.ensureEnabled()).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: "GOOGLE_OAUTH_NOT_CONFIGURED"
        })
      })
    );
  });

  it("builds fixed frontend statuses without identity or token material", () => {
    const { service } = createService(true);

    expect(service.successRedirect()).toBe(
      "http://localhost:3000/?auth=google-success"
    );
    expect(service.cancelledRedirect()).toBe(
      "http://localhost:3000/?auth=google-cancelled"
    );
    expect(service.failureRedirect()).toBe(
      "http://localhost:3000/?auth=google-error&code=GOOGLE_LOGIN_FAILED"
    );
  });

  it("logs only a structured reason and correlation identifier", () => {
    const { logger, service } = createService(true);
    service.logFailure(new GoogleOAuthError("ID_TOKEN_INVALID"));

    expect(logger.warn).toHaveBeenCalledWith(
      {
        reasonCode: "ID_TOKEN_INVALID",
        correlationId: "correlation-id"
      },
      "Google OAuth login failed"
    );
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(
      "token"
    );
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls)).not.toContain(
      "email"
    );
  });
});
