const { spawnSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const backendRoot = join(repositoryRoot, "app", "backend");
const dotenv = require(join(backendRoot, "node_modules", "dotenv"));

dotenv.config({
  path: join(backendRoot, ".env"),
  override: false,
  quiet: true
});

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for test migration status validation"
  );
}

const prismaCli = require.resolve("prisma/build/index.js", {
  paths: [backendRoot]
});
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "status",
    "--config",
    join(backendRoot, "prisma.config.ts")
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl
    },
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
