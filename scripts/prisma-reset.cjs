const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const {
  assertInteractiveResetAllowed,
  assertLocalResetTarget,
  backendRoot,
  buildPrismaResetArguments,
  formatSanitizedTarget,
  loadBackendEnvironment
} = require("./database-environment.cjs");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function main() {
  const [environment, option, ...extra] = process.argv.slice(2);
  if (
    (environment !== "development" && environment !== "test") ||
    (option !== undefined && option !== "--check") ||
    extra.length > 0
  ) {
    throw new Error(
      "Usage: prisma-reset.cjs <development|test> [--check]"
    );
  }

  const envFile = environment === "development" ? ".env" : ".env.test";
  loadBackendEnvironment(envFile, { override: true, required: true });

  if (process.env.NODE_ENV !== environment) {
    throw new Error(
      `${envFile} must set NODE_ENV=${environment} for database reset`
    );
  }

  const target = assertLocalResetTarget(
    process.env.DATABASE_URL,
    environment
  );
  process.stdout.write(
    `Database reset target: ${formatSanitizedTarget(target, environment)}\n`
  );

  if (option === "--check") {
    process.stdout.write("Database reset check passed; no data was changed.\n");
    return;
  }

  assertInteractiveResetAllowed();

  process.stdout.write(
    "WARNING: Prisma will delete all data in this database and reapply migrations. Seeding is separate.\n"
  );

  const prismaCli = require.resolve("prisma/build/index.js", {
    paths: [backendRoot]
  });
  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      ...buildPrismaResetArguments(
        join(backendRoot, "prisma.config.ts")
      )
    ],
    {
      cwd: backendRoot,
      env: process.env,
      stdio: "inherit"
    }
  );

  if (result.error) {
    throw result.error;
  }
  process.exitCode = result.status ?? 1;
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : "Database reset failed");
}
