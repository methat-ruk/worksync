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
        "*.password",
        "*.passwordHash",
        "*.accessToken",
        "*.refreshToken",
        "*.secret",
        "*.apiKey"
      ])
    );
    expect(options.redact.censor).toBe("[REDACTED]");
    expect(options).not.toHaveProperty("serializers.req.body");
    expect(options).not.toHaveProperty("serializers.res.body");
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
        passwordHash: "scrypt$encoded-password-hash"
      }
    });

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("sensitive-access-token");
    expect(output).not.toContain("plaintext-password");
    expect(output).not.toContain("encoded-password-hash");
  });
});
