import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CookieOptions, Response } from "express";

import type { Environment } from "../../config/environment";
import { GoogleOAuthError } from "../errors/google-oauth.error";
import type {
  GoogleOAuthTransaction,
  GoogleOAuthTransactionCookies
} from "../types/google-oauth.types";

const TRANSACTION_LIFETIME_MS = 10 * 60 * 1_000;
const CALLBACK_PATH = "/api/auth/google/callback";
const STATE_COOKIE = "worksync_google_oauth_state";
const NONCE_COOKIE = "worksync_google_oauth_nonce";
const VERIFIER_COOKIE = "worksync_google_oauth_verifier";

function randomValue(): string {
  return randomBytes(32).toString("base64url");
}

function readCookie(
  cookieHeader: string | undefined,
  expectedName: string
): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (part.slice(0, separator).trim() !== expectedName) {
      continue;
    }
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

@Injectable()
export class GoogleOAuthTransactionService {
  constructor(
    private readonly config: ConfigService<Environment, true>
  ) {}

  create(): GoogleOAuthTransaction {
    const codeVerifier = randomValue();
    return {
      state: randomValue(),
      nonce: randomValue(),
      codeVerifier,
      codeChallenge: createHash("sha256")
        .update(codeVerifier, "utf8")
        .digest("base64url")
    };
  }

  set(response: Response, transaction: GoogleOAuthTransaction): void {
    const options = {
      ...this.baseOptions(),
      maxAge: TRANSACTION_LIFETIME_MS
    };
    response.cookie(STATE_COOKIE, transaction.state, options);
    response.cookie(NONCE_COOKIE, transaction.nonce, options);
    response.cookie(VERIFIER_COOKIE, transaction.codeVerifier, options);
  }

  read(cookieHeader: string | undefined): GoogleOAuthTransactionCookies | null {
    const state = readCookie(cookieHeader, STATE_COOKIE);
    const nonce = readCookie(cookieHeader, NONCE_COOKIE);
    const codeVerifier = readCookie(cookieHeader, VERIFIER_COOKIE);
    return state && nonce && codeVerifier
      ? { state, nonce, codeVerifier }
      : null;
  }

  clear(response: Response): void {
    const options = this.baseOptions();
    response.clearCookie(STATE_COOKIE, options);
    response.clearCookie(NONCE_COOKIE, options);
    response.clearCookie(VERIFIER_COOKIE, options);
  }

  verifyState(
    returnedState: string | undefined,
    transaction: GoogleOAuthTransactionCookies | null
  ): GoogleOAuthTransactionCookies {
    if (
      !returnedState ||
      returnedState.length > 256 ||
      !transaction ||
      !safeEqual(returnedState, transaction.state)
    ) {
      throw new GoogleOAuthError("STATE_MISMATCH");
    }
    return transaction;
  }

  private baseOptions(): CookieOptions {
    const domain = this.config.get("COOKIE_DOMAIN", { infer: true });
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      path: CALLBACK_PATH,
      ...(domain ? { domain } : {})
    };
  }
}
