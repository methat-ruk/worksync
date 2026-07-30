const assert = require("node:assert/strict");

const {
  assertInteractiveResetAllowed,
  assertLocalResetTarget,
  assertTestDatabaseUrl,
  buildPrismaResetArguments,
  formatSanitizedTarget,
  parseDatabaseUrl
} = require("./database-environment.cjs");

const testUrl =
  "postgresql://worksync:secret@localhost:5433/worksync_test?schema=public";
const developmentUrl =
  "postgresql://worksync:secret@localhost:5433/worksync?schema=public";

assert.equal(assertTestDatabaseUrl(testUrl).databaseName, "worksync_test");
assert.equal(
  assertLocalResetTarget(developmentUrl, "development").databaseName,
  "worksync"
);
assert.equal(
  assertLocalResetTarget(testUrl, "test").databaseName,
  "worksync_test"
);

assert.throws(() => parseDatabaseUrl(), /DATABASE_URL is required/);
assert.throws(
  () => parseDatabaseUrl("not-a-url"),
  /valid PostgreSQL URL/
);
assert.throws(
  () => parseDatabaseUrl("mysql://localhost/worksync_test"),
  /PostgreSQL protocol/
);
assert.throws(
  () => assertTestDatabaseUrl(developmentUrl),
  /name ends in _test/
);
assert.throws(
  () =>
    assertLocalResetTarget(
      "postgresql://worksync:secret@db.example.com/worksync_test",
      "test"
    ),
  /local PostgreSQL host/
);
assert.throws(
  () => assertLocalResetTarget(developmentUrl, "production"),
  /development or test only/
);
assert.doesNotThrow(() =>
  assertInteractiveResetAllowed({
    ci: "false",
    stdinIsTTY: true,
    stdoutIsTTY: true
  })
);
assert.throws(
  () =>
    assertInteractiveResetAllowed({
      ci: "true",
      stdinIsTTY: true,
      stdoutIsTTY: true
    }),
  /disabled in CI\/CD/
);
assert.throws(
  () =>
    assertInteractiveResetAllowed({
      ci: undefined,
      stdinIsTTY: false,
      stdoutIsTTY: true
    }),
  /interactive local terminal/
);

const resetArguments = buildPrismaResetArguments("prisma.config.ts");
assert.deepEqual(resetArguments, [
  "migrate",
  "reset",
  "--config",
  "prisma.config.ts"
]);
assert.equal(resetArguments.includes("--force"), false);

const sanitized = formatSanitizedTarget(
  assertTestDatabaseUrl(testUrl),
  "test"
);
assert.match(sanitized, /database=worksync_test/);
assert.doesNotMatch(sanitized, /secret|schema|worksync:secret/);

process.stdout.write("Database environment self-test passed.\n");
