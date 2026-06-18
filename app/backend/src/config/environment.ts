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

  if (emailProvider && emailProvider !== "disabled" && !emailApiKey) {
    throw new Error(
      "Environment variable EMAIL_API_KEY is required when EMAIL_PROVIDER is enabled"
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
    ...(emailProvider ? { EMAIL_PROVIDER: emailProvider } : {}),
    ...(emailApiKey ? { EMAIL_API_KEY: emailApiKey } : {})
  };
}
