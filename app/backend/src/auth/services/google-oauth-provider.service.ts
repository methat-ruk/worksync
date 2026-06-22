import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  OAuth2Client,
  type TokenPayload
} from "google-auth-library";

import type { Environment } from "../../config/environment";
import { normalizeEmail } from "../dto/auth.dto";
import { GoogleOAuthError } from "../errors/google-oauth.error";
import type {
  GoogleIdentityProfile,
  GoogleOAuthTransaction
} from "../types/google-oauth.types";

export const GOOGLE_OAUTH_CLIENT = Symbol("GOOGLE_OAUTH_CLIENT");
export const GOOGLE_OAUTH_FETCH = Symbol("GOOGLE_OAUTH_FETCH");

const GOOGLE_AUTHORIZATION_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com"
]);

type GoogleTokenResponse = {
  id_token?: unknown;
};

function displayName(payload: TokenPayload, email: string): string {
  const name = payload.name?.trim();
  const fallback = email.split("@")[0]?.trim() || "Google User";
  return (name || fallback).slice(0, 100);
}

export function profileFromGooglePayload(
  payload: TokenPayload,
  expectedAudience: string,
  expectedNonce: string,
  nowSeconds = Math.floor(Date.now() / 1_000)
): GoogleIdentityProfile {
  if (
    !GOOGLE_ISSUERS.has(payload.iss) ||
    payload.aud !== expectedAudience ||
    payload.exp <= nowSeconds ||
    payload.nonce !== expectedNonce ||
    typeof payload.sub !== "string" ||
    payload.sub.length === 0 ||
    typeof payload.email !== "string"
  ) {
    throw new GoogleOAuthError("ID_TOKEN_INVALID");
  }
  if (payload.email_verified !== true) {
    throw new GoogleOAuthError("EMAIL_UNVERIFIED");
  }

  const email = normalizeEmail(payload.email);
  if (email.length === 0 || email.length > 320) {
    throw new GoogleOAuthError("ID_TOKEN_INVALID");
  }

  const hostedDomain = payload.hd?.trim();
  return {
    subject: payload.sub,
    email,
    displayName: displayName(payload, email),
    ...(hostedDomain ? { hostedDomain } : {})
  };
}

@Injectable()
export class GoogleOAuthProviderService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    @Inject(GOOGLE_OAUTH_CLIENT)
    private readonly client: OAuth2Client,
    @Inject(GOOGLE_OAUTH_FETCH)
    private readonly fetchImplementation: typeof fetch
  ) {}

  authorizationUrl(transaction: GoogleOAuthTransaction): string {
    const url = new URL(GOOGLE_AUTHORIZATION_URL);
    url.search = new URLSearchParams({
      client_id: this.requiredConfig("GOOGLE_OAUTH_CLIENT_ID"),
      redirect_uri: this.requiredConfig("GOOGLE_OAUTH_REDIRECT_URI"),
      response_type: "code",
      scope: "openid email profile",
      state: transaction.state,
      nonce: transaction.nonce,
      code_challenge: transaction.codeChallenge,
      code_challenge_method: "S256"
    }).toString();
    return url.toString();
  }

  async authenticate(
    code: string,
    codeVerifier: string,
    expectedNonce: string
  ): Promise<GoogleIdentityProfile> {
    if (code.length === 0 || code.length > 4096) {
      throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
    }
    const idToken = await this.exchangeCode(code, codeVerifier);
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.requiredConfig("GOOGLE_OAUTH_CLIENT_ID")
      });
      const payload = ticket.getPayload();
      if (!payload) {
        throw new GoogleOAuthError("ID_TOKEN_INVALID");
      }
      return profileFromGooglePayload(
        payload,
        this.requiredConfig("GOOGLE_OAUTH_CLIENT_ID"),
        expectedNonce
      );
    } catch (error: unknown) {
      if (error instanceof GoogleOAuthError) {
        throw error;
      }
      throw new GoogleOAuthError("ID_TOKEN_INVALID");
    }
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<string> {
    const timeout = this.config.get("GOOGLE_OAUTH_TOKEN_TIMEOUT_MS", {
      infer: true
    });
    if (!timeout) {
      throw new GoogleOAuthError("GOOGLE_OAUTH_NOT_CONFIGURED");
    }

    try {
      const response = await this.fetchImplementation(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: this.requiredConfig("GOOGLE_OAUTH_CLIENT_ID"),
          client_secret: this.requiredConfig("GOOGLE_OAUTH_CLIENT_SECRET"),
          redirect_uri: this.requiredConfig("GOOGLE_OAUTH_REDIRECT_URI"),
          grant_type: "authorization_code",
          code_verifier: codeVerifier
        }),
        signal: AbortSignal.timeout(timeout)
      });
      if (!response.ok) {
        throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
      }
      const body = (await response.json()) as GoogleTokenResponse;
      if (typeof body.id_token !== "string" || body.id_token.length === 0) {
        throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
      }
      return body.id_token;
    } catch (error: unknown) {
      if (error instanceof GoogleOAuthError) {
        throw error;
      }
      throw new GoogleOAuthError("TOKEN_EXCHANGE_FAILED");
    }
  }

  private requiredConfig(
    key:
      | "GOOGLE_OAUTH_CLIENT_ID"
      | "GOOGLE_OAUTH_CLIENT_SECRET"
      | "GOOGLE_OAUTH_REDIRECT_URI"
  ): string {
    const value = this.config.get(key, { infer: true });
    if (!value) {
      throw new GoogleOAuthError("GOOGLE_OAUTH_NOT_CONFIGURED");
    }
    return value;
  }
}
