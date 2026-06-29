import { validateEnvironment } from "../../src/config/environment";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4000",
  FRONTEND_URL: "http://localhost:3000",
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL:
    "postgresql://worksync:worksync@localhost:55432/worksync?schema=public",
  REDIS_URL: "redis://localhost:6379/1",
  LOG_LEVEL: "info",
  AUTH_RATE_LIMIT_ENABLED: "true",
  AUTH_RATE_LIMIT_KEY_SECRET:
    "a-secure-rate-limit-secret-with-at-least-32-bytes",
  TRUST_PROXY: "false",
  JWT_ACCESS_SECRET: "a-secure-access-secret-with-at-least-32-bytes",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_SECRET: "a-secure-refresh-secret-with-at-least-32-bytes",
  JWT_REFRESH_EXPIRES_IN: "30d",
  COOKIE_SECURE: "false",
  GOOGLE_OAUTH_ENABLED: "true",
  GOOGLE_OAUTH_CLIENT_ID: "test-google-client-id",
  GOOGLE_OAUTH_CLIENT_SECRET: "test-google-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI:
    "http://localhost:4000/api/auth/google/callback",
  GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: "5000"
};

describe("validateEnvironment", () => {
  it("parses the active runtime configuration", () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      PORT: 4000,
      AUTH_RATE_LIMIT_ENABLED: true,
      AUTH_RATE_LIMIT_KEY_SECRET:
        "a-secure-rate-limit-secret-with-at-least-32-bytes",
      TRUST_PROXY: false,
      JWT_ACCESS_EXPIRES_IN: 900,
      JWT_REFRESH_EXPIRES_IN: 2_592_000,
      COOKIE_SECURE: false,
      GOOGLE_OAUTH_ENABLED: true,
      GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: 5000
    });
  });

  it("rejects weak JWT secrets and invalid token lifetimes", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_SECRET: "too-short"
      })
    ).toThrow("JWT_ACCESS_SECRET must contain at least 32 bytes");
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_EXPIRES_IN: "forever"
      })
    ).toThrow("JWT_ACCESS_EXPIRES_IN must be a positive duration");
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: "too-short"
      })
    ).toThrow("JWT_REFRESH_SECRET must contain at least 32 bytes");
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_EXPIRES_IN: "forever"
      })
    ).toThrow("JWT_REFRESH_EXPIRES_IN must be a positive duration");
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET
      })
    ).toThrow("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ");
  });

  it("rejects a missing active setting", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: undefined
      })
    ).toThrow("Environment variable DATABASE_URL is required");
  });

  it("rejects invalid enum and port values", () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, NODE_ENV: "staging" })
    ).toThrow("Environment variable NODE_ENV must be one of");
    expect(() =>
      validateEnvironment({ ...validEnvironment, PORT: "70000" })
    ).toThrow("Environment variable PORT must be an integer");
    expect(() =>
      validateEnvironment({ ...validEnvironment, COOKIE_SECURE: "sometimes" })
    ).toThrow("Environment variable COOKIE_SECURE must be true or false");
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        COOKIE_SECURE: "false"
      })
    ).toThrow("COOKIE_SECURE must be true in production");
  });

  it("requires an API key only when email is enabled", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        EMAIL_PROVIDER: "resend"
      })
    ).toThrow("EMAIL_API_KEY is required");

    expect(
      validateEnvironment({
        ...validEnvironment,
        EMAIL_PROVIDER: "disabled"
      }).EMAIL_PROVIDER
    ).toBe("disabled");
  });

  it("allows Google OAuth to be disabled only in development", () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "development",
        GOOGLE_OAUTH_ENABLED: "false",
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        GOOGLE_OAUTH_REDIRECT_URI: undefined,
        GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: undefined
      }).GOOGLE_OAUTH_ENABLED
    ).toBe(false);
    expect(
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "development",
        GOOGLE_OAUTH_ENABLED: undefined,
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        GOOGLE_OAUTH_REDIRECT_URI: undefined,
        GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: undefined
      }).GOOGLE_OAUTH_ENABLED
    ).toBe(false);

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_OAUTH_ENABLED: "false"
      })
    ).toThrow("GOOGLE_OAUTH_ENABLED must be true outside development");
  });

  it("requires auth rate limiting in production and validates its secret", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        COOKIE_SECURE: "true",
        AUTH_RATE_LIMIT_ENABLED: "false"
      })
    ).toThrow("AUTH_RATE_LIMIT_ENABLED must be true in production");

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_RATE_LIMIT_KEY_SECRET: "too-short"
      })
    ).toThrow("AUTH_RATE_LIMIT_KEY_SECRET must contain at least 32 bytes");

    expect(
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "development",
        GOOGLE_OAUTH_ENABLED: "false",
        GOOGLE_OAUTH_CLIENT_ID: undefined,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined,
        GOOGLE_OAUTH_REDIRECT_URI: undefined,
        GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: undefined,
        AUTH_RATE_LIMIT_ENABLED: undefined,
        AUTH_RATE_LIMIT_KEY_SECRET: undefined
      }).AUTH_RATE_LIMIT_ENABLED
    ).toBe(false);
  });

  it("validates enabled Google OAuth configuration and timeout", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_OAUTH_CLIENT_SECRET: undefined
      })
    ).toThrow("GOOGLE_OAUTH_CLIENT_SECRET is required");

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        GOOGLE_OAUTH_TOKEN_TIMEOUT_MS: "30001"
      })
    ).toThrow("GOOGLE_OAUTH_TOKEN_TIMEOUT_MS must be a positive integer");
  });
});
