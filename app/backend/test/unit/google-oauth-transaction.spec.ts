import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

import { GoogleOAuthTransactionService } from "../../src/auth/services/google-oauth-transaction.service";
import type { Environment } from "../../src/config/environment";

describe("GoogleOAuthTransactionService", () => {
  const service = new GoogleOAuthTransactionService(
    new ConfigService<Environment, true>({
      COOKIE_SECURE: true,
      COOKIE_DOMAIN: "example.com"
    })
  );

  it("creates independent state, nonce, verifier, and PKCE challenge", () => {
    const first = service.create();
    const second = service.create();

    expect(first.state).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.codeVerifier).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.codeChallenge).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(first.codeChallenge).not.toBe(first.codeVerifier);
    expect(second.state).not.toBe(first.state);
  });

  it("sets, reads, verifies, and clears callback-scoped cookies", () => {
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn()
    } as unknown as Response;
    const transaction = service.create();

    service.set(response, transaction);
    const cookieHeader = (response.cookie as jest.Mock).mock.calls
      .map(([name, value]) => `${name as string}=${value as string}`)
      .join("; ");
    const stored = service.read(cookieHeader);

    expect(stored).toEqual({
      state: transaction.state,
      nonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier
    });
    expect(service.verifyState(transaction.state, stored)).toEqual(stored);
    expect(response.cookie).toHaveBeenCalledTimes(3);
    for (const call of (response.cookie as jest.Mock).mock.calls) {
      expect(call[2]).toEqual(
        expect.objectContaining({
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          domain: "example.com",
          path: "/api/auth/google/callback",
          maxAge: 600_000
        })
      );
    }

    service.clear(response);
    expect(response.clearCookie).toHaveBeenCalledTimes(3);
  });

  it("rejects missing, malformed, and mismatched callback state", () => {
    const transaction = service.create();
    const stored = {
      state: transaction.state,
      nonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier
    };

    expect(() => service.verifyState(undefined, stored)).toThrow(
      expect.objectContaining({ reasonCode: "STATE_MISMATCH" })
    );
    expect(() => service.verifyState("wrong-state", stored)).toThrow(
      expect.objectContaining({ reasonCode: "STATE_MISMATCH" })
    );
    expect(() => service.verifyState("x".repeat(257), stored)).toThrow(
      expect.objectContaining({ reasonCode: "STATE_MISMATCH" })
    );
  });
});
