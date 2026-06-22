import {
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PinoLogger } from "nestjs-pino";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import type { Environment } from "../../config/environment";
import { CorrelationContextService } from "../../observability/correlation-context.service";
import {
  GoogleOAuthError,
  type GoogleOAuthFailureReason
} from "../errors/google-oauth.error";
import type {
  GoogleOAuthTransaction,
  GoogleOAuthTransactionCookies
} from "../types/google-oauth.types";
import { GoogleIdentityService } from "./google-identity.service";
import { GoogleOAuthProviderService } from "./google-oauth-provider.service";
import { GoogleOAuthTransactionService } from "./google-oauth-transaction.service";
import type { SessionAuthentication } from "./session.service";

export type GoogleOAuthStart = {
  authorizationUrl: string;
  transaction: GoogleOAuthTransaction;
};

@Injectable()
export class GoogleOAuthService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly provider: GoogleOAuthProviderService,
    private readonly identities: GoogleIdentityService,
    private readonly transactions: GoogleOAuthTransactionService,
    private readonly logger: PinoLogger,
    private readonly correlationContext: CorrelationContextService
  ) {
    this.logger.setContext(GoogleOAuthService.name);
  }

  begin(): GoogleOAuthStart {
    this.ensureEnabled();
    const transaction = this.transactions.create();
    return {
      transaction,
      authorizationUrl: this.provider.authorizationUrl(transaction)
    };
  }

  validateState(
    returnedState: string | undefined,
    transaction: GoogleOAuthTransactionCookies | null
  ): GoogleOAuthTransactionCookies {
    this.ensureEnabled();
    return this.transactions.verifyState(returnedState, transaction);
  }

  async complete(
    code: string | undefined,
    returnedState: string | undefined,
    transaction: GoogleOAuthTransactionCookies | null,
    userAgent: string | undefined
  ): Promise<SessionAuthentication> {
    const verifiedTransaction = this.validateState(
      returnedState,
      transaction
    );
    if (!code) {
      throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
    }
    const profile = await this.provider.authenticate(
      code,
      verifiedTransaction.codeVerifier,
      verifiedTransaction.nonce
    );
    return this.identities.authenticate(profile, userAgent);
  }

  successRedirect(): string {
    return this.frontendRedirect("google-success");
  }

  cancelledRedirect(): string {
    return this.frontendRedirect("google-cancelled");
  }

  failureRedirect(): string {
    const url = new URL(this.frontendRedirect("google-error"));
    url.searchParams.set("code", API_ERROR_CODE.GOOGLE_LOGIN_FAILED);
    return url.toString();
  }

  logFailure(error: unknown): void {
    const reasonCode: GoogleOAuthFailureReason =
      error instanceof GoogleOAuthError
        ? error.reasonCode
        : "PROVIDER_ERROR";
    const correlationId = this.correlationContext.getCorrelationId();
    this.logger.warn(
      {
        reasonCode,
        ...(correlationId ? { correlationId } : {})
      },
      "Google OAuth login failed"
    );
  }

  ensureEnabled(): void {
    if (!this.config.get("GOOGLE_OAUTH_ENABLED", { infer: true })) {
      throw new ServiceUnavailableException({
        message: "Google OAuth is not configured",
        code: API_ERROR_CODE.GOOGLE_OAUTH_NOT_CONFIGURED
      });
    }
  }

  private frontendRedirect(status: string): string {
    const url = new URL(
      "/",
      this.config.get("FRONTEND_URL", { infer: true })
    );
    url.searchParams.set("auth", status);
    return url.toString();
  }
}
