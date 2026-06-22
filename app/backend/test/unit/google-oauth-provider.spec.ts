import { ConfigService } from "@nestjs/config";
import {
  type LoginTicket,
  type OAuth2Client,
  type TokenPayload
} from "google-auth-library";

import {
  GoogleOAuthProviderService,
  profileFromGooglePayload
} from "../../src/auth/services/google-oauth-provider.service";
import type { Environment } from "../../src/config/environment";

const config = new ConfigService<Environment, true>({
  GOOGLE_OAUTH_CLIENT_ID: "google-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI:
    "http://localhost:4000/api/auth/google/callback",
  GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: 5000
});

function payload(
  overrides: Partial<TokenPayload> = {}
): TokenPayload {
  return {
    iss: "https://accounts.google.com",
    aud: "google-client-id",
    sub: "google-subject",
    email: "Ada@Gmail.com",
    email_verified: true,
    name: "Ada Lovelace",
    nonce: "expected-nonce",
    iat: 1_700_000_000,
    exp: 4_000_000_000,
    ...overrides
  } as TokenPayload;
}

describe("GoogleOAuthProviderService", () => {
  it("builds an authorization URL with minimum scopes, state, nonce, and PKCE", () => {
    const provider = new GoogleOAuthProviderService(
      config,
      {} as OAuth2Client,
      jest.fn() as unknown as typeof fetch
    );
    const url = new URL(
      provider.authorizationUrl({
        state: "state",
        nonce: "nonce",
        codeVerifier: "verifier",
        codeChallenge: "challenge"
      })
    );

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("nonce")).toBe("nonce");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("access_type")).toBe(false);
  });

  it("normalizes a verified minimum Google identity profile", () => {
    expect(
      profileFromGooglePayload(
        payload({ hd: "example.com" }),
        "google-client-id",
        "expected-nonce",
        1_800_000_000
      )
    ).toEqual({
      subject: "google-subject",
      email: "ada@gmail.com",
      displayName: "Ada Lovelace",
      hostedDomain: "example.com"
    });
  });

  it.each([
    ["issuer", { iss: "https://attacker.example" }, "ID_TOKEN_INVALID"],
    ["audience", { aud: "other-client" }, "ID_TOKEN_INVALID"],
    ["expiry", { exp: 1_700_000_000 }, "ID_TOKEN_INVALID"],
    ["nonce", { nonce: "wrong" }, "ID_TOKEN_INVALID"],
    ["subject", { sub: "" }, "ID_TOKEN_INVALID"],
    ["email", { email: "" }, "ID_TOKEN_INVALID"],
    ["verification", { email_verified: false }, "EMAIL_UNVERIFIED"]
  ])("rejects an invalid %s claim", (_name, override, reasonCode) => {
    expect(() =>
      profileFromGooglePayload(
        payload(override),
        "google-client-id",
        "expected-nonce",
        1_800_000_000
      )
    ).toThrow(expect.objectContaining({ reasonCode }));
  });

  it("exchanges the code with PKCE and verifies the returned ID token", async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => payload()
    } satisfies Pick<LoginTicket, "getPayload">);
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: "google-id-token" })
    });
    const provider = new GoogleOAuthProviderService(
      config,
      { verifyIdToken } as unknown as OAuth2Client,
      fetchImplementation as unknown as typeof fetch
    );

    await expect(
      provider.authenticate(
        "authorization-code",
        "code-verifier",
        "expected-nonce"
      )
    ).resolves.toEqual(
      expect.objectContaining({ subject: "google-subject" })
    );
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal)
      })
    );
    const request = fetchImplementation.mock.calls[0]?.[1] as RequestInit;
    expect(request.body?.toString()).toContain("code_verifier=code-verifier");
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "google-id-token",
      audience: "google-client-id"
    });
  });

  it("maps provider timeout or malformed exchange responses to one internal reason", async () => {
    const provider = new GoogleOAuthProviderService(
      config,
      {} as OAuth2Client,
      jest
        .fn()
        .mockRejectedValue(new DOMException("timeout", "TimeoutError")) as unknown as typeof fetch
    );

    await expect(
      provider.authenticate("code", "verifier", "nonce")
    ).rejects.toEqual(
      expect.objectContaining({ reasonCode: "TOKEN_EXCHANGE_FAILED" })
    );
  });

  it("maps ID-token signature verification failure to the invalid-token reason", async () => {
    const provider = new GoogleOAuthProviderService(
      config,
      {
        verifyIdToken: jest.fn().mockRejectedValue(new Error("bad signature"))
      } as unknown as OAuth2Client,
      jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id_token: "invalidly-signed-token" })
      }) as unknown as typeof fetch
    );

    await expect(
      provider.authenticate("code", "verifier", "expected-nonce")
    ).rejects.toEqual(
      expect.objectContaining({ reasonCode: "ID_TOKEN_INVALID" })
    );
  });
});
