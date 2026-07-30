const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative } = require("node:path");
const { parseEnv } = require("node:util");

const {
  assertTestDatabaseUrl,
  repositoryRoot
} = require("./database-environment.cjs");

const COMPOSE_PROJECT_NAME = "worksync-test";
const dockerRoot = join(repositoryRoot, "docker");
const composeFile = join(dockerRoot, "compose.test.yml");
const localEnvironmentFile = join(dockerRoot, ".env.test");
const exampleEnvironmentFile = join(dockerRoot, ".env.test.example");
const environmentSelectorName = "WORKSYNC_DOCKER_TEST_ENV_FILE";
const dockerTestLockFile = join(tmpdir(), "worksync-docker-test.lock");

const scopePlans = Object.freeze({
  backend: {
    build: ["backend-test"],
    dependencies: ["postgres", "redis"],
    run: ["migration-test", "backend-test"]
  },
  frontend: {
    build: ["frontend-test"],
    dependencies: [],
    run: ["frontend-test"]
  },
  e2e: {
    build: ["migration-test", "frontend-e2e"],
    dependencies: ["postgres"],
    run: ["migration-test", "frontend-e2e"]
  },
  all: {
    build: ["backend-test", "frontend-e2e"],
    dependencies: ["postgres", "redis"],
    run: [
      "migration-test",
      "backend-test",
      "frontend-test",
      "frontend-e2e"
    ]
  }
});

function requireValue(values, name) {
  const value = values[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required in docker/.env.test`);
  }
  return value;
}

function validateTestEnvironmentValues(values) {
  if (requireValue(values, "NODE_ENV") !== "test") {
    throw new Error("NODE_ENV must be test in docker/.env.test");
  }

  const postgresDatabase = requireValue(values, "POSTGRES_DB");
  requireValue(values, "POSTGRES_USER");
  requireValue(values, "POSTGRES_PASSWORD");

  const target = assertTestDatabaseUrl(requireValue(values, "DATABASE_URL"));
  if (target.hostname !== "postgres") {
    throw new Error(
      "DATABASE_URL must use the postgres Compose service as its host"
    );
  }
  if (target.databaseName !== postgresDatabase) {
    throw new Error("DATABASE_URL database must match POSTGRES_DB");
  }

  if (requireValue(values, "TEST_REDIS_URL") !== "redis://redis:6379/1") {
    throw new Error(
      "TEST_REDIS_URL must use redis://redis:6379/1 in docker/.env.test"
    );
  }
  if (
    requireValue(values, "NEXT_PUBLIC_API_BASE_URL") !==
    "http://localhost:4000"
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be http://localhost:4000 in docker/.env.test"
    );
  }
  if (requireValue(values, "NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED") !== "false") {
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED must be false in docker/.env.test"
    );
  }

  return {
    databaseName: target.databaseName,
    databaseHost: target.hostname
  };
}

function loadTestEnvironment(filePath = localEnvironmentFile) {
  if (!existsSync(filePath)) {
    throw new Error(
      "docker/.env.test is required; copy docker/.env.test.example first"
    );
  }

  const values = parseEnv(readFileSync(filePath, "utf8"));
  validateTestEnvironmentValues(values);
  return values;
}

function createScopePlan(scope) {
  const plan = scopePlans[scope];
  if (!plan) {
    throw new Error(
      `Unknown Docker test scope "${scope}". Use backend, frontend, e2e, or all.`
    );
  }

  return {
    build: [...plan.build],
    dependencies: [...plan.dependencies],
    run: [...plan.run]
  };
}

function acquireDockerTestLock({
  file = dockerTestLockFile,
  ownerPid = process.pid,
  ownerToken = randomUUID()
} = {}) {
  try {
    writeFileSync(
      file,
      `${JSON.stringify({ pid: ownerPid, token: ownerToken })}\n`,
      { flag: "wx" }
    );
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }

    let ownerDetail = "";
    try {
      const owner = JSON.parse(readFileSync(file, "utf8"));
      if (Number.isInteger(owner.pid)) {
        ownerDetail = ` (owner pid ${owner.pid})`;
      }
    } catch {
      // A missing or damaged owner record must still fail closed.
    }

    throw new Error(
      `Another Docker test run already owns ${COMPOSE_PROJECT_NAME}${ownerDetail}; wait for it to finish or run docker:test:down after confirming it stopped`
    );
  }

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;

    try {
      const owner = JSON.parse(readFileSync(file, "utf8"));
      if (owner.token === ownerToken) {
        rmSync(file, { force: true });
      }
    } catch {
      // Manual recovery may already have removed or replaced this lock.
    }
  };
}

function clearDockerTestLock(file = dockerTestLockFile) {
  rmSync(file, { force: true });
}

function createComposeArguments(environmentFile, ...arguments_) {
  return [
    "compose",
    "--project-name",
    COMPOSE_PROJECT_NAME,
    "--env-file",
    environmentFile,
    "-f",
    composeFile,
    ...arguments_
  ];
}

function createComposeEnvironment(environmentFile) {
  return {
    ...process.env,
    [environmentSelectorName]: relative(dockerRoot, environmentFile)
  };
}

function createDockerExecutor({
  spawnProcess = spawn,
  onChildStart = () => {},
  onChildEnd = () => {}
} = {}) {
  return function executeDocker(
    arguments_,
    { capture = false, environmentFile = localEnvironmentFile } = {}
  ) {
    return new Promise((resolvePromise, rejectPromise) => {
      const child = spawnProcess("docker", arguments_, {
        cwd: repositoryRoot,
        env: createComposeEnvironment(environmentFile),
        shell: false,
        stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
        windowsHide: true
      });

      onChildStart(child);

      let stdout = "";
      let stderr = "";
      if (capture) {
        child.stdout.on("data", (chunk) => {
          stdout += chunk;
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
        });
      }

      child.once("error", (error) => {
        onChildEnd(child);
        rejectPromise(error);
      });
      child.once("close", (code, signal) => {
        onChildEnd(child);
        if (code === 0) {
          resolvePromise({ code, signal, stderr, stdout });
          return;
        }

        const detail = capture && stderr.trim() ? `: ${stderr.trim()}` : "";
        const error = new Error(
          `docker ${arguments_.join(" ")} failed with exit code ${code}${detail}`
        );
        error.exitCode = typeof code === "number" ? code : 1;
        rejectPromise(error);
      });
    });
  };
}

function createSingleFlight(operation) {
  let operationPromise;
  return () => {
    if (!operationPromise) {
      operationPromise = Promise.resolve().then(operation);
    }
    return operationPromise;
  };
}

function createSignalHandler({
  cleanup,
  getActiveChild,
  getActiveDockerPromise,
  isCleanupInProgress = () => false,
  onSignal
}) {
  return async (signal) => {
    onSignal(signal);
    const child = getActiveChild();
    if (child && !child.killed && !isCleanupInProgress()) {
      child.kill();
    }

    const activeExecution = getActiveDockerPromise();
    if (activeExecution) {
      await activeExecution.catch(() => {});
    }
    await cleanup();
  };
}

async function runDockerTestLifecycle({
  executeDocker,
  plan,
  localFile = localEnvironmentFile,
  exampleFile = exampleEnvironmentFile,
  onCleanupAuthorized = () => {}
}) {
  const actual = (...arguments_) =>
    executeDocker(createComposeArguments(localFile, ...arguments_), {
      environmentFile: localFile
    });
  const actualCaptured = (...arguments_) =>
    executeDocker(createComposeArguments(localFile, ...arguments_), {
      capture: true,
      environmentFile: localFile
    });
  const cleanup = () =>
    executeDocker(
      createComposeArguments(
        exampleFile,
        "down",
        "--volumes",
        "--remove-orphans"
      ),
      { environmentFile: exampleFile }
    );

  await actual("config", "--quiet");
  const running = await actualCaptured("ps", "--status", "running", "--quiet");
  if (running.stdout.trim()) {
    throw new Error(
      `Docker Compose project ${COMPOSE_PROJECT_NAME} is already running; stop it before starting an isolated test run`
    );
  }

  onCleanupAuthorized();
  await cleanup();
  await actual("build", ...plan.build);

  if (plan.dependencies.length > 0) {
    await actual("up", "-d", "--wait", ...plan.dependencies);
  }

  for (const service of plan.run) {
    await actual("run", "--rm", service);
  }
}

async function runWithCleanup({
  operation,
  cleanup,
  reportCleanupFailure = (error) => {
    console.error(`Docker test cleanup also failed: ${error.message}`);
  }
}) {
  let primaryError;
  try {
    await operation();
  } catch (error) {
    primaryError = error;
  }

  try {
    await cleanup();
  } catch (cleanupError) {
    if (!primaryError) {
      primaryError = cleanupError;
    } else {
      reportCleanupFailure(cleanupError);
    }
  }

  if (primaryError) {
    throw primaryError;
  }
}

function signalExitCode(signal) {
  return signal === "SIGINT" ? 130 : 143;
}

async function run(scope = process.argv[2]) {
  if (scope === "down") {
    const executeDocker = createDockerExecutor();
    await executeDocker(
      createComposeArguments(
        exampleEnvironmentFile,
        "down",
        "--volumes",
        "--remove-orphans"
      ),
      { environmentFile: exampleEnvironmentFile }
    );
    clearDockerTestLock();
    return;
  }

  loadTestEnvironment();

  if (scope === "config") {
    const executeDocker = createDockerExecutor();
    await executeDocker(
      createComposeArguments(localEnvironmentFile, "config", "--quiet"),
      { environmentFile: localEnvironmentFile }
    );
    return;
  }

  const plan = createScopePlan(scope);
  let activeChild;
  let cleanupAuthorized = false;
  let cleanupInProgress = false;
  let interruptedSignal;
  let activeDockerPromise;

  const baseDockerExecutor = createDockerExecutor({
    onChildStart(child) {
      activeChild = child;
    },
    onChildEnd(child) {
      if (activeChild === child) {
        activeChild = undefined;
      }
    }
  });
  const executeDocker = (...arguments_) => {
    const execution = baseDockerExecutor(...arguments_);
    activeDockerPromise = execution;
    void execution.then(
      () => {
        if (activeDockerPromise === execution) {
          activeDockerPromise = undefined;
        }
      },
      () => {
        if (activeDockerPromise === execution) {
          activeDockerPromise = undefined;
        }
      }
    );
    return execution;
  };

  const executeCleanup = createSingleFlight(async () => {
    cleanupInProgress = true;
    try {
      await executeDocker(
        createComposeArguments(
          exampleEnvironmentFile,
          "down",
          "--volumes",
          "--remove-orphans"
        ),
        { environmentFile: exampleEnvironmentFile }
      );
    } finally {
      cleanupInProgress = false;
    }
  });
  const cleanup = () => {
    if (!cleanupAuthorized) {
      return Promise.resolve();
    }
    return executeCleanup();
  };

  const handleSignal = createSignalHandler({
    cleanup,
    getActiveChild: () => activeChild,
    getActiveDockerPromise: () => activeDockerPromise,
    isCleanupInProgress: () => cleanupInProgress,
    onSignal(signal) {
      interruptedSignal = interruptedSignal || signal;
    }
  });
  const handleSigint = () => void handleSignal("SIGINT").catch(() => {});
  const handleSigterm = () => void handleSignal("SIGTERM").catch(() => {});

  const releaseDockerTestLock = acquireDockerTestLock();
  process.on("SIGINT", handleSigint);
  process.on("SIGTERM", handleSigterm);

  try {
    let primaryError;
    try {
      await runWithCleanup({
        operation: () =>
          runDockerTestLifecycle({
            executeDocker,
            plan,
            onCleanupAuthorized() {
              cleanupAuthorized = true;
            }
          }),
        cleanup
      });
    } catch (error) {
      primaryError = error;
    } finally {
      process.removeListener("SIGINT", handleSigint);
      process.removeListener("SIGTERM", handleSigterm);
    }

    if (interruptedSignal) {
      if (primaryError && cleanupAuthorized) {
        console.error(primaryError.message);
      }
      process.exitCode = signalExitCode(interruptedSignal);
      return;
    }
    if (primaryError) {
      throw primaryError;
    }
  } finally {
    releaseDockerTestLock();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = error.exitCode || 1;
  });
}

module.exports = {
  COMPOSE_PROJECT_NAME,
  acquireDockerTestLock,
  clearDockerTestLock,
  createSignalHandler,
  createSingleFlight,
  createScopePlan,
  loadTestEnvironment,
  runDockerTestLifecycle,
  runWithCleanup,
  validateTestEnvironmentValues
};
