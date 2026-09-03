const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  COMPOSE_PROJECT_NAME,
  acquireDockerTestLock,
  acquireDockerTestRecoveryLock,
  createSignalHandler,
  createSingleFlight,
  createScopePlan,
  loadTestEnvironment,
  runDockerTestLifecycle,
  runWithCleanup,
  validateTestEnvironmentValues
} = require("./docker-test.cjs");

const validEnvironment = {
  NODE_ENV: "test",
  POSTGRES_DB: "worksync_test",
  POSTGRES_USER: "worksync",
  POSTGRES_PASSWORD: "worksync",
  DATABASE_URL:
    "postgresql://worksync:worksync@postgres:5432/worksync_test?schema=public",
  TEST_REDIS_URL: "redis://redis:6379/1",
  S3_REGION: "us-east-1",
  S3_BUCKET: "worksync-test",
  S3_ACCESS_KEY_ID: "worksync",
  S3_SECRET_ACCESS_KEY: "worksync-local-secret",
  S3_ENDPOINT: "http://minio:9000",
  S3_FORCE_PATH_STYLE: "true",
  NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
  NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: "false"
};

function commandFrom(arguments_) {
  const composeIndex = arguments_.indexOf("compose");
  assert.equal(composeIndex, 0);
  return arguments_.slice(arguments_.indexOf("-f") + 2).join(" ");
}

async function testEnvironmentValidation() {
  assert.deepEqual(validateTestEnvironmentValues(validEnvironment), {
    databaseHost: "postgres",
    databaseName: "worksync_test"
  });

  assert.throws(
    () =>
      validateTestEnvironmentValues({
        ...validEnvironment,
        DATABASE_URL:
          "postgresql://worksync:worksync@postgres:5432/worksync?schema=public"
      }),
    /ends in _test/
  );
  assert.throws(
    () =>
      validateTestEnvironmentValues({
        ...validEnvironment,
        DATABASE_URL:
          "postgresql://worksync:worksync@localhost:5432/worksync_test?schema=public"
      }),
    /postgres Compose service/
  );
  assert.throws(
    () =>
      validateTestEnvironmentValues({
        ...validEnvironment,
        POSTGRES_DB: "another_test"
      }),
    /must match POSTGRES_DB/
  );

  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "worksync-docker-test-")
  );
  const environmentFile = join(temporaryDirectory, ".env.test");
  const inheritedDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL =
    "postgresql://worksync:worksync@localhost:5432/worksync";
  try {
    writeFileSync(
      environmentFile,
      `${Object.entries(validEnvironment)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n")}\n`
    );
    assert.deepEqual(loadTestEnvironment(environmentFile), validEnvironment);
    assert.equal(
      process.env.DATABASE_URL,
      "postgresql://worksync:worksync@localhost:5432/worksync"
    );
  } finally {
    if (inheritedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = inheritedDatabaseUrl;
    }
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function testScopeSelection() {
  assert.deepEqual(createScopePlan("backend"), {
    build: ["backend-test"],
    dependencies: ["postgres", "redis", "minio"],
    run: ["migration-test", "backend-test"]
  });
  assert.deepEqual(createScopePlan("frontend"), {
    build: ["frontend-test"],
    dependencies: [],
    run: ["frontend-test"]
  });
  assert.deepEqual(createScopePlan("e2e"), {
    build: ["migration-test", "frontend-e2e"],
    dependencies: ["postgres"],
    run: ["migration-test", "frontend-e2e"]
  });
  assert.throws(() => createScopePlan("unknown"), /Unknown Docker test scope/);
}

function testCrossProcessLock() {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "worksync-docker-lock-test-")
  );
  const lockFile = join(temporaryDirectory, "lock");

  try {
    const releaseFirst = acquireDockerTestLock({
      file: lockFile,
      ownerPid: 101,
      ownerToken: "first"
    });

    assert.throws(
      () =>
        acquireDockerTestLock({
          file: lockFile,
          ownerPid: 202,
          ownerToken: "second"
        }),
      new RegExp(`already owns ${COMPOSE_PROJECT_NAME} \\(owner pid 101\\)`)
    );

    assert.throws(
      () =>
        acquireDockerTestRecoveryLock({
          file: lockFile,
          ownerPid: 202,
          ownerToken: "second",
          processIsRunning: () => true
        }),
      /pid 101 is still active/
    );

    const releaseSecond = acquireDockerTestRecoveryLock({
      file: lockFile,
      ownerPid: 202,
      ownerToken: "second",
      processIsRunning: () => false
    });

    releaseFirst();
    assert.throws(
      () =>
        acquireDockerTestLock({
          file: lockFile,
          ownerPid: 303,
          ownerToken: "third"
        }),
      new RegExp(`already owns ${COMPOSE_PROJECT_NAME} \\(owner pid 202\\)`)
    );

    releaseSecond();
    const releaseThird = acquireDockerTestLock({
      file: lockFile,
      ownerPid: 303,
      ownerToken: "third"
    });
    releaseThird();
    releaseThird();

    const releaseStale = acquireDockerTestLock({
      file: lockFile,
      ownerPid: 404,
      ownerToken: "stale"
    });
    let releaseCompetingRun;
    assert.throws(
      () =>
        acquireDockerTestRecoveryLock({
          file: lockFile,
          ownerPid: 505,
          ownerToken: "recovery",
          processIsRunning: () => false,
          onStaleLockRemoved() {
            releaseCompetingRun = acquireDockerTestLock({
              file: lockFile,
              ownerPid: 606,
              ownerToken: "competing"
            });
          }
        }),
      /Another Docker test run started during stale-lock recovery/
    );
    assert.throws(
      () =>
        acquireDockerTestLock({
          file: lockFile,
          ownerPid: 707,
          ownerToken: "late"
        }),
      new RegExp(`already owns ${COMPOSE_PROJECT_NAME} \\(owner pid 606\\)`)
    );
    releaseStale();
    releaseCompetingRun();
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function testSuccessfulLifecycle() {
  const commands = [];
  let cleanupAuthorized = false;

  await runDockerTestLifecycle({
    plan: createScopePlan("backend"),
    onCleanupAuthorized() {
      cleanupAuthorized = true;
    },
    async executeDocker(arguments_, options) {
      const command = commandFrom(arguments_);
      commands.push(command);
      if (command === "ps --status running --quiet") {
        assert.equal(options.capture, true);
        return { code: 0, stderr: "", stdout: "" };
      }
      return { code: 0, stderr: "", stdout: "" };
    }
  });

  assert.equal(cleanupAuthorized, true);
  assert.deepEqual(commands, [
    "config --quiet",
    "ps --status running --quiet",
    "down --volumes --remove-orphans",
    "build backend-test",
    "up -d --wait postgres redis minio",
    "run --rm migration-test",
    "run --rm backend-test"
  ]);
}

async function testActiveProjectProtection() {
  let cleanupAuthorized = false;
  const commands = [];

  await assert.rejects(
    runDockerTestLifecycle({
      plan: createScopePlan("frontend"),
      onCleanupAuthorized() {
        cleanupAuthorized = true;
      },
      async executeDocker(arguments_) {
        const command = commandFrom(arguments_);
        commands.push(command);
        return {
          code: 0,
          stderr: "",
          stdout:
            command === "ps --status running --quiet" ? "container-id\n" : ""
        };
      }
    }),
    new RegExp(`${COMPOSE_PROJECT_NAME} is already running`)
  );

  assert.equal(cleanupAuthorized, false);
  assert.deepEqual(commands, [
    "config --quiet",
    "ps --status running --quiet"
  ]);
}

async function testFirstFailureStopsExecution() {
  const commands = [];

  await assert.rejects(
    runDockerTestLifecycle({
      plan: createScopePlan("all"),
      async executeDocker(arguments_) {
        const command = commandFrom(arguments_);
        commands.push(command);
        if (command === "ps --status running --quiet") {
          return { code: 0, stderr: "", stdout: "" };
        }
        if (command === "run --rm backend-test") {
          throw new Error("backend failed");
        }
        return { code: 0, stderr: "", stdout: "" };
      }
    }),
    /backend failed/
  );

  assert.equal(commands.at(-1), "run --rm backend-test");
  assert.equal(commands.includes("run --rm frontend-test"), false);
}

async function testCleanupPreservesFirstFailure() {
  const primaryError = new Error("primary failure");
  const cleanupError = new Error("cleanup failure");
  let cleanupCalls = 0;
  let reportedCleanupError;

  await assert.rejects(
    runWithCleanup({
      async operation() {
        throw primaryError;
      },
      async cleanup() {
        cleanupCalls += 1;
        throw cleanupError;
      },
      reportCleanupFailure(error) {
        reportedCleanupError = error;
      }
    }),
    (error) => error === primaryError
  );

  assert.equal(cleanupCalls, 1);
  assert.equal(reportedCleanupError, cleanupError);
}

async function testSingleFlightCleanup() {
  let cleanupCalls = 0;
  const cleanup = createSingleFlight(async () => {
    cleanupCalls += 1;
  });

  const first = cleanup();
  const second = cleanup();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(cleanupCalls, 1);
}

async function testSignalWaitsBeforeCleanup() {
  let releaseActiveCommand;
  const activeCommand = new Promise((resolve) => {
    releaseActiveCommand = resolve;
  });
  let killed = false;
  let cleaned = false;
  let receivedSignal;

  const handleSignal = createSignalHandler({
    async cleanup() {
      cleaned = true;
    },
    getActiveChild: () => ({
      killed: false,
      kill() {
        killed = true;
      }
    }),
    getActiveDockerPromise: () => activeCommand,
    onSignal(signal) {
      receivedSignal = signal;
    }
  });

  const handling = handleSignal("SIGTERM");
  await Promise.resolve();
  assert.equal(killed, true);
  assert.equal(cleaned, false);
  releaseActiveCommand();
  await handling;
  assert.equal(cleaned, true);
  assert.equal(receivedSignal, "SIGTERM");

  killed = false;
  cleaned = false;
  const handleSignalDuringCleanup = createSignalHandler({
    async cleanup() {
      cleaned = true;
    },
    getActiveChild: () => ({
      killed: false,
      kill() {
        killed = true;
      }
    }),
    getActiveDockerPromise: () => Promise.resolve(),
    isCleanupInProgress: () => true,
    onSignal() {}
  });
  await handleSignalDuringCleanup("SIGINT");
  assert.equal(killed, false);
  assert.equal(cleaned, true);
}

async function main() {
  await testEnvironmentValidation();
  testScopeSelection();
  testCrossProcessLock();
  await testSuccessfulLifecycle();
  await testActiveProjectProtection();
  await testFirstFailureStopsExecution();
  await testCleanupPreservesFirstFailure();
  await testSingleFlightCleanup();
  await testSignalWaitsBeforeCleanup();
  console.log("Docker test orchestration self-test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
