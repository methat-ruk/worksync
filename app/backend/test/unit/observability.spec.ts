import { ConfigService } from "@nestjs/config";

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
});
