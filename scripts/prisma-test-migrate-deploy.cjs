const { spawnSync } = require("node:child_process");
const { join } = require("node:path");

const {
  backendRoot,
  loadTestDatabaseUrl,
  repositoryRoot
} = require("./database-environment.cjs");

loadTestDatabaseUrl();

const prismaCli = require.resolve("prisma/build/index.js", {
  paths: [backendRoot]
});
const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    "migrate",
    "deploy",
    "--config",
    join(backendRoot, "prisma.config.ts")
  ],
  {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit"
  }
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
