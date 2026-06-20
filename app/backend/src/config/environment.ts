export const NODE_ENV_VALUES = ["development", "test", "production"] as const;
export const LOG_LEVEL_VALUES = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent"
] as const;

export type NodeEnvironment = (typeof NODE_ENV_VALUES)[number];
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

export type Environment = {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  CORS_ORIGIN: string;
  DATABASE_URL: string;
  LOG_LEVEL: LogLevel;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_EXPIRES_IN: number;
  JWT_REFRESH_SECRET: string;
  JWT_REFRESH_EXPIRES_IN: number;
  COOKIE_SECURE: boolean;
  COOKIE_DOMAIN?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
};

function requireValue(
  config: Record<string, unknown>,
  key: string
): string {
  const value = config[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Environment variable ${key} is required`);
  }

  return value.trim();
}

function parseUrl(value: string, key: string): string {
  try {
    new URL(value);
    return value;
  } catch {
    throw new Error(`Environment variable ${key} must be a valid URL`);
  }
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Environment variable PORT must be an integer from 1 to 65535");
  }

  return port;
}

const DURATION_PATTERN = /^(\d+)(s|m|h|d)$/;
const DURATION_MULTIPLIERS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60
} as const;

function parsePositiveDuration(value: string, key: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `Environment variable ${key} must be a positive duration such as 15m`
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof DURATION_MULTIPLIERS;
  const seconds = amount * DURATION_MULTIPLIERS[unit];
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error(`Environment variable ${key} must be a positive duration`);
  }

  return seconds;
}

function parseJwtSecret(value: string, key: string): string {
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(
      `Environment variable ${key} must contain at least 32 bytes`
    );
  }

  return value;
}

function parseBoolean(value: string, key: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`Environment variable ${key} must be true or false`);
}

function parseEnum<T extends readonly string[]>(
  value: string,
  key: string,
  allowed: T
): T[number] {
  if (!allowed.includes(value)) {
    throw new Error(
      `Environment variable ${key} must be one of: ${allowed.join(", ")}`
    );
  }

  return value as T[number];
}

export function validateEnvironment(
  config: Record<string, unknown>
): Environment {
  const nodeEnvironment = parseEnum(
    requireValue(config, "NODE_ENV"),
    "NODE_ENV",
    NODE_ENV_VALUES
  );
  const logLevel = parseEnum(
    requireValue(config, "LOG_LEVEL"),
    "LOG_LEVEL",
    LOG_LEVEL_VALUES
  );
  const emailProvider =
    typeof config.EMAIL_PROVIDER === "string"
      ? config.EMAIL_PROVIDER.trim()
      : undefined;
  const emailApiKey =
    typeof config.EMAIL_API_KEY === "string"
      ? config.EMAIL_API_KEY.trim()
      : undefined;
  const cookieDomain =
    typeof config.COOKIE_DOMAIN === "string" &&
    config.COOKIE_DOMAIN.trim() !== ""
      ? config.COOKIE_DOMAIN.trim()
      : undefined;

  if (emailProvider && emailProvider !== "disabled" && !emailApiKey) {
    throw new Error(
      "Environment variable EMAIL_API_KEY is required when EMAIL_PROVIDER is enabled"
    );
  }
  const accessSecret = parseJwtSecret(
    requireValue(config, "JWT_ACCESS_SECRET"),
    "JWT_ACCESS_SECRET"
  );
  const refreshSecret = parseJwtSecret(
    requireValue(config, "JWT_REFRESH_SECRET"),
    "JWT_REFRESH_SECRET"
  );
  if (accessSecret === refreshSecret) {
    throw new Error(
      "Environment variables JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ"
    );
  }
  const cookieSecure = parseBoolean(
    requireValue(config, "COOKIE_SECURE"),
    "COOKIE_SECURE"
  );
  if (nodeEnvironment === "production" && !cookieSecure) {
    throw new Error(
      "Environment variable COOKIE_SECURE must be true in production"
    );
  }

  return {
    NODE_ENV: nodeEnvironment,
    PORT: parsePort(requireValue(config, "PORT")),
    CORS_ORIGIN: parseUrl(requireValue(config, "CORS_ORIGIN"), "CORS_ORIGIN"),
    DATABASE_URL: parseUrl(
      requireValue(config, "DATABASE_URL"),
      "DATABASE_URL"
    ),
    LOG_LEVEL: logLevel,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_ACCESS_EXPIRES_IN: parsePositiveDuration(
      requireValue(config, "JWT_ACCESS_EXPIRES_IN"),
      "JWT_ACCESS_EXPIRES_IN"
    ),
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_REFRESH_EXPIRES_IN: parsePositiveDuration(
      requireValue(config, "JWT_REFRESH_EXPIRES_IN"),
      "JWT_REFRESH_EXPIRES_IN"
    ),
    COOKIE_SECURE: cookieSecure,
    ...(cookieDomain ? { COOKIE_DOMAIN: cookieDomain } : {}),
    ...(emailProvider ? { EMAIL_PROVIDER: emailProvider } : {}),
    ...(emailApiKey ? { EMAIL_API_KEY: emailApiKey } : {})
  };
}
