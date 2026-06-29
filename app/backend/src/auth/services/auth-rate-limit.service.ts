import { createHmac } from "node:crypto";
import { Socket } from "node:net";

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PinoLogger } from "nestjs-pino";

import { API_ERROR_CODE } from "../../common/errors/api-error-code";
import type { Environment } from "../../config/environment";
import { CorrelationContextService } from "../../observability/correlation-context.service";

export type AuthRateLimitPolicy =
  | "LOGIN_IDENTITY"
  | "LOGIN_IP"
  | "SIGNUP_IDENTITY"
  | "SIGNUP_IP"
  | "REFRESH_TOKEN"
  | "REFRESH_IP"
  | "GOOGLE_START_IP"
  | "GOOGLE_CALLBACK";

type AuthRateLimitRule = {
  limit: number;
  windowMs: number;
};

const AUTH_RATE_LIMIT_RULES: Record<AuthRateLimitPolicy, AuthRateLimitRule> = {
  LOGIN_IDENTITY: { limit: 5, windowMs: 60_000 },
  LOGIN_IP: { limit: 30, windowMs: 60_000 },
  SIGNUP_IDENTITY: { limit: 3, windowMs: 10 * 60_000 },
  SIGNUP_IP: { limit: 20, windowMs: 10 * 60_000 },
  REFRESH_TOKEN: { limit: 30, windowMs: 60_000 },
  REFRESH_IP: { limit: 120, windowMs: 60_000 },
  GOOGLE_START_IP: { limit: 20, windowMs: 10 * 60_000 },
  GOOGLE_CALLBACK: { limit: 20, windowMs: 10 * 60_000 }
};

const REDIS_FIXED_WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return current
`.trim();

export type RateLimitConsumeResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export interface AuthRateLimitStore {
  consume(key: string, windowMs: number): Promise<number>;
}

export const AUTH_RATE_LIMIT_STORE = Symbol("AUTH_RATE_LIMIT_STORE");

type RedisConnection = {
  host: string;
  port: number;
  password?: string;
  database?: number;
};

function parseRedisUrl(rawUrl: string): RedisConnection {
  const url = new URL(rawUrl);
  if (url.protocol !== "redis:") {
    throw new Error("REDIS_URL must use the redis:// protocol");
  }
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(database) || database < 0) {
    throw new Error("REDIS_URL database must be a non-negative integer");
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(database ? { database } : {})
  };
}

function encodeRedisCommand(parts: string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

function parseIntegerResponse(response: string): number {
  if (!response.startsWith(":")) {
    throw new Error("Unexpected Redis integer response");
  }
  return Number(response.slice(1).trim());
}

async function redisCommand(
  connection: RedisConnection,
  parts: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let data = "";
    const expectedResponses =
      1 + (connection.password ? 1 : 0) + (connection.database ? 1 : 0);
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(error);
      }
    };
    const finish = (response: string) => {
      if (!settled) {
        settled = true;
        socket.end();
        resolve(response);
      }
    };

    socket.setTimeout(1_500, () => fail(new Error("Redis command timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
      if (!data.endsWith("\r\n")) {
        return;
      }
      const responses = data
        .split("\r\n")
        .filter(Boolean)
        .filter(
          (line) =>
            line.startsWith("+") ||
            line.startsWith(":") ||
            line.startsWith("-")
        );
      const error = responses.find((line) => line.startsWith("-"));
      if (error) {
        fail(new Error(error.slice(1).trim()));
        return;
      }
      if (responses.length >= expectedResponses) {
        finish(responses[responses.length - 1]!);
      }
    });
    socket.connect(connection.port, connection.host, () => {
      const commands: string[] = [];
      if (connection.password) {
        commands.push(encodeRedisCommand(["AUTH", connection.password]));
      }
      if (connection.database) {
        commands.push(
          encodeRedisCommand(["SELECT", String(connection.database)])
        );
      }
      commands.push(encodeRedisCommand(parts));
      socket.write(commands.join(""));
    });
  });
}

@Injectable()
export class RedisAuthRateLimitStore implements AuthRateLimitStore {
  private readonly connection: RedisConnection;

  constructor(config: ConfigService<Environment, true>) {
    this.connection = parseRedisUrl(config.get("REDIS_URL", { infer: true }));
  }

  async consume(key: string, windowMs: number): Promise<number> {
    return parseIntegerResponse(
      await redisCommand(this.connection, [
        "EVAL",
        REDIS_FIXED_WINDOW_SCRIPT,
        "1",
        key,
        String(windowMs)
      ])
    );
  }
}

function requestIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || "unknown";
}

@Injectable()
export class AuthRateLimiterService {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    @Inject(AUTH_RATE_LIMIT_STORE)
    private readonly store: AuthRateLimitStore,
    private readonly logger: PinoLogger,
    private readonly correlationContext: CorrelationContextService
  ) {
    this.logger.setContext(AuthRateLimiterService.name);
  }

  async consume(
    policy: AuthRateLimitPolicy,
    request: Request,
    identifier: string
  ): Promise<void> {
    if (!this.config.get("AUTH_RATE_LIMIT_ENABLED", { infer: true })) {
      return;
    }

    const rule = AUTH_RATE_LIMIT_RULES[policy];
    const key = this.key(policy, `${requestIp(request)}:${identifier}`);
    let count: number;
    try {
      count = await this.store.consume(key, rule.windowMs);
    } catch {
      throw new ServiceUnavailableException({
        message: "Authentication protection is temporarily unavailable",
        code: API_ERROR_CODE.SERVICE_NOT_READY
      });
    }

    if (count <= rule.limit) {
      return;
    }

    const retryAfterSeconds = Math.ceil(rule.windowMs / 1000);
    this.logger.warn(
      {
        reasonCode: "AUTH_RATE_LIMITED",
        policy,
        correlationId: this.correlationContext.getCorrelationId()
      },
      "Authentication request rate limited"
    );
    throw new HttpException(
      {
        message: "Too many authentication attempts. Please try again later.",
        code: API_ERROR_CODE.RATE_LIMITED,
        retryAfterSeconds
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  async consumeIp(policy: AuthRateLimitPolicy, request: Request): Promise<void> {
    await this.consume(policy, request, "ip");
  }

  private key(policy: AuthRateLimitPolicy, identifier: string): string {
    const secret = this.config.get("AUTH_RATE_LIMIT_KEY_SECRET", {
      infer: true
    });
    if (!secret) {
      throw new ServiceUnavailableException({
        message: "Authentication protection is not configured",
        code: API_ERROR_CODE.SERVICE_NOT_READY
      });
    }
    const digest = createHmac("sha256", secret)
      .update(identifier)
      .digest("hex");
    return `worksync:auth-rate:${policy}:${digest}`;
  }
}
