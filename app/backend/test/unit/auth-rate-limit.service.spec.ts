import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException
} from "@nestjs/common";

import {
  AuthRateLimiterService,
  type AuthRateLimitStore
} from "../../src/auth/services/auth-rate-limit.service";

function config(values: Record<string, unknown>) {
  return {
    get: jest.fn((key: string) => values[key])
  };
}

function logger() {
  return {
    setContext: jest.fn(),
    warn: jest.fn()
  };
}

function correlation() {
  return {
    getCorrelationId: jest.fn(() => "correlation-id")
  };
}

function request(ip = "203.0.113.10") {
  return {
    ip,
    socket: { remoteAddress: ip }
  };
}

describe("AuthRateLimiterService", () => {
  it("does nothing when auth rate limiting is disabled", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn()
    };
    const service = new AuthRateLimiterService(
      config({ AUTH_RATE_LIMIT_ENABLED: false }) as never,
      store,
      logger() as never,
      correlation() as never
    );

    await service.consume("LOGIN_IDENTITY", request() as never, "ada@example.com");

    expect(store.consume).not.toHaveBeenCalled();
  });

  it("hashes limiter keys and rejects over-limit attempts", async () => {
    const capturedKeys: string[] = [];
    const store: AuthRateLimitStore = {
      consume: jest.fn(async (key) => {
        capturedKeys.push(key);
        return 6;
      })
    };
    const service = new AuthRateLimiterService(
      config({
        AUTH_RATE_LIMIT_ENABLED: true,
        AUTH_RATE_LIMIT_KEY_SECRET:
          "test-rate-limit-secret-with-at-least-32-bytes"
      }) as never,
      store,
      logger() as never,
      correlation() as never
    );

    let thrown: unknown;
    try {
      await service.consume(
        "LOGIN_IDENTITY",
        request() as never,
        "ada@example.com"
      );
    } catch (error: unknown) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS
    );

    expect(capturedKeys[0]).toMatch(/^worksync:auth-rate:LOGIN_IDENTITY:/);
    expect(capturedKeys[0]).not.toContain("ada@example.com");
    expect(capturedKeys[0]).not.toContain("203.0.113.10");
  });

  it("fails closed when the limiter store is unavailable", async () => {
    const store: AuthRateLimitStore = {
      consume: jest.fn(async () => {
        throw new Error("Redis unavailable");
      })
    };
    const service = new AuthRateLimiterService(
      config({
        AUTH_RATE_LIMIT_ENABLED: true,
        AUTH_RATE_LIMIT_KEY_SECRET:
          "test-rate-limit-secret-with-at-least-32-bytes"
      }) as never,
      store,
      logger() as never,
      correlation() as never
    );

    await expect(
      service.consume("LOGIN_IP", request() as never, "ip")
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
