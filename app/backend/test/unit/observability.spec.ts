import { Writable } from "node:stream";

import { ConfigService } from "@nestjs/config";
import pino from "pino";

import type { Environment } from "../../src/config/environment";
import { createPinoHttpOptions } from "../../src/observability/observability.module";

describe("createPinoHttpOptions", () => {
  it("redacts credentials and sensitive application fields", () => {
    const config = new ConfigService<Environment, true>({
      LOG_LEVEL: "info"
    });
    const options = createPinoHttpOptions(config);

    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.headers.cookie",
        "res.headers.location",
        "*.password",
        "*.passwordHash",
        "*.accessToken",
        "*.refreshToken",
        "*.refreshTokenHash",
        "*.secret",
        "*.apiKey"
      ])
    );
    expect(options.redact.censor).toBe("[REDACTED]");
    expect(options).not.toHaveProperty("serializers.req.body");
    expect(options).not.toHaveProperty("serializers.res.body");
  });

  it("removes Google callback material and redirect locations from logs", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    const config = new ConfigService<Environment, true>({
      LOG_LEVEL: "info"
    });
    const options = createPinoHttpOptions(config);
    const logger = pino(
      {
        redact: options.redact,
        serializers: options.serializers
      },
      destination
    );

    logger.info({
      req: {
        method: "GET",
        originalUrl:
          "/api/auth/google/callback?code=secret-code&state=secret-state",
        query: { code: "secret-code", state: "secret-state" },
        headers: {}
      },
      res: {
        headers: {
          location:
            "https://accounts.google.com/o/oauth2/v2/auth?state=secret-state&nonce=secret-nonce"
        }
      }
    });

    expect(output).toContain("/api/auth/google/callback");
    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("secret-code");
    expect(output).not.toContain("secret-state");
    expect(output).not.toContain("secret-nonce");
  });

  it("removes bearer tokens, passwords, and password hashes from emitted logs", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    const config = new ConfigService<Environment, true>({
      LOG_LEVEL: "info"
    });
    const options = createPinoHttpOptions(config);
    const logger = pino({ redact: options.redact }, destination);

    logger.info({
      req: {
        headers: { authorization: "Bearer sensitive-access-token" }
      },
      auth: {
        password: "plaintext-password",
        passwordHash: "scrypt$encoded-password-hash",
        refreshTokenHash: "encoded-refresh-token-hash"
      }
    });

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("sensitive-access-token");
    expect(output).not.toContain("plaintext-password");
    expect(output).not.toContain("encoded-password-hash");
    expect(output).not.toContain("encoded-refresh-token-hash");
  });
});
