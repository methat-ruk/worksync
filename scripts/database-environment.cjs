const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const backendRoot = join(repositoryRoot, "app", "backend");
const dotenv = require(join(backendRoot, "node_modules", "dotenv"));

const LOCAL_TEST_DATABASE_FALLBACK =
  "postgresql://worksync:worksync@localhost:5433/worksync_test?schema=public";
const LOCAL_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
  "worksync-postgres"
]);

function loadBackendEnvironment(
  fileName,
  { override = false, required = false } = {}
) {
  const path = join(backendRoot, fileName);
  if (required && !existsSync(path)) {
    throw new Error(`${fileName} is required for this database command`);
  }

  const result = dotenv.config({
    path,
    override,
    quiet: true
  });
  if (result.error && result.error.code !== "ENOENT") {
    throw new Error(`Could not load ${fileName}`);
  }
}

function parseDatabaseUrl(value) {
  if (!value) {
    throw new Error("DATABASE_URL is required");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the PostgreSQL protocol");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!databaseName || databaseName.includes("/")) {
    throw new Error("DATABASE_URL must identify one PostgreSQL database");
  }

  return {
    databaseName,
    hostname: url.hostname.toLowerCase(),
    port: url.port || "5432",
    url: value
  };
}

function assertTestDatabaseUrl(value) {
  const target = parseDatabaseUrl(value);
  if (!target.databaseName.endsWith("_test")) {
    throw new Error(
      "DATABASE_URL must target a test database whose name ends in _test"
    );
  }
  return target;
}

function assertLocalResetTarget(value, environment) {
  const target = parseDatabaseUrl(value);
  if (!LOCAL_DATABASE_HOSTS.has(target.hostname)) {
    throw new Error("Database reset requires a local PostgreSQL host");
  }

  if (environment === "development") {
    if (target.databaseName !== "worksync") {
      throw new Error(
        "Development reset requires the local worksync database"
      );
    }
    return target;
  }

  if (environment === "test") {
    return assertTestDatabaseUrl(value);
  }

  throw new Error("Database reset supports development or test only");
}

function loadTestDatabaseUrl({ allowDefault = false } = {}) {
  loadBackendEnvironment(".env.test", { override: true });
  process.env.NODE_ENV = "test";

  if (!process.env.DATABASE_URL && allowDefault) {
    process.env.DATABASE_URL = LOCAL_TEST_DATABASE_FALLBACK;
  }

  return assertTestDatabaseUrl(process.env.DATABASE_URL).url;
}

function formatSanitizedTarget(target, environment) {
  return [
    `environment=${environment}`,
    `host=${target.hostname}`,
    `port=${target.port}`,
    `database=${target.databaseName}`
  ].join(" ");
}

function assertInteractiveResetAllowed({
  ci = process.env.CI,
  stdinIsTTY = process.stdin.isTTY,
  stdoutIsTTY = process.stdout.isTTY
} = {}) {
  if ((ci && ci !== "false") || !stdinIsTTY || !stdoutIsTTY) {
    throw new Error(
      "Database reset requires an interactive local terminal and is disabled in CI/CD"
    );
  }
}

function buildPrismaResetArguments(configPath) {
  return ["migrate", "reset", "--config", configPath];
}

module.exports = {
  LOCAL_TEST_DATABASE_FALLBACK,
  assertInteractiveResetAllowed,
  assertLocalResetTarget,
  assertTestDatabaseUrl,
  backendRoot,
  buildPrismaResetArguments,
  formatSanitizedTarget,
  loadBackendEnvironment,
  loadTestDatabaseUrl,
  parseDatabaseUrl,
  repositoryRoot
};
