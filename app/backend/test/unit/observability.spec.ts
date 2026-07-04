import { Writable } from "node:stream";

import { ConfigService } from "@nestjs/config";
import pino from "pino";

import type { Environment } from "../../src/config/environment";
import { createPinoHttpOptions } from "../../src/observability/observability.module";

describe("createPinoHttpOptions", () => {
  it("redacts credentials and sensitive application fields", () => {
    const config = new ConfigService<Environment, true>({
      LOG_LEVEL: "info",
      NODE_ENV: "production"
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
      LOG_LEVEL: "info",
      NODE_ENV: "production"
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
    expect(output).not.toContain("secret-code");
    expect(output).not.toContain("secret-state");
    expect(output).not.toContain("secret-nonce");
    expect(output).not.toContain("accounts.google.com");
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
      LOG_LEVEL: "info",
      NODE_ENV: "production"
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

  it("serializes HTTP access logs without noisy request or response headers", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      }
    });
    const config = new ConfigService<Environment, true>({
      LOG_LEVEL: "info",
      NODE_ENV: "production"
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
        id: "request-123",
        method: "POST",
        originalUrl: "/api/auth/login?debug=sensitive",
        headers: {
          authorization: "Bearer sensitive-access-token",
          cookie: "worksync_refresh_token=sensitive-refresh-token",
          "user-agent": "Mozilla/5.0 noisy browser header"
        },
        user: { id: "user-123" }
      },
      res: {
        statusCode: 200,
        headers: {
          "set-cookie": "worksync_refresh_token=sensitive-refresh-token",
          "content-type": "application/json"
        }
      }
    });

    expect(output).toContain('"method":"POST"');
    expect(output).toContain('"url":"/api/auth/login"');
    expect(output).toContain('"statusCode":200');
    expect(output).toContain('"userId":"user-123"');
    expect(output).not.toContain("headers");
    expect(output).not.toContain("sensitive-access-token");
    expect(output).not.toContain("sensitive-refresh-token");
    expect(output).not.toContain("Mozilla/5.0 noisy browser header");
    expect(output).not.toContain("debug=sensitive");
  });

  it("uses pretty logs only in development", () => {
    const development = createPinoHttpOptions(
      new ConfigService<Environment, true>({
        LOG_LEVEL: "debug",
        NODE_ENV: "development"
      })
    );
    const production = createPinoHttpOptions(
      new ConfigService<Environment, true>({
        LOG_LEVEL: "info",
        NODE_ENV: "production"
      })
    );

    expect(development.transport).toMatchObject({
      target: "pino-pretty",
      options: expect.objectContaining({
        singleLine: true
      })
    });
    expect(production).not.toHaveProperty("transport");
  });

  it("classifies server failures as HTTP error logs", () => {
    const config = new ConfigService<Environment, true>({
      LOG_LEVEL: "info",
      NODE_ENV: "production"
    });
    const options = createPinoHttpOptions(config);
    const value = {
      req: { method: "GET", url: "/api/failure" },
      res: { statusCode: 503 }
    };

    expect(
      options.customSuccessObject?.(
        {} as Parameters<NonNullable<typeof options.customSuccessObject>>[0],
        { statusCode: 503 } as Parameters<
          NonNullable<typeof options.customSuccessObject>
        >[1],
        value
      )
    ).toMatchObject({
      event: "http_request_completed",
      logType: "http_error"
    });
    expect(
      options.customErrorObject?.(
        {} as Parameters<NonNullable<typeof options.customErrorObject>>[0],
        { statusCode: 500 } as Parameters<
          NonNullable<typeof options.customErrorObject>
        >[1],
        new Error("failed"),
        value
      )
    ).toMatchObject({
      event: "http_request_failed",
      logType: "http_error"
    });
  });
});
