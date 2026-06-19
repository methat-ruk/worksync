import { validateEnvironment } from "../../src/config/environment";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4000",
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL:
    "postgresql://worksync:worksync@localhost:55432/worksync?schema=public",
  LOG_LEVEL: "info",
  JWT_ACCESS_SECRET: "a-secure-access-secret-with-at-least-32-bytes",
  JWT_ACCESS_EXPIRES_IN: "15m"
};

describe("validateEnvironment", () => {
  it("parses the active runtime configuration", () => {
    expect(validateEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      PORT: 4000,
      JWT_ACCESS_EXPIRES_IN: 900
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
});
