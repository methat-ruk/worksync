const { spawn } = require("node:child_process");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const dockerRoot = join(repositoryRoot, "docker");
const infrastructureComposeFile = join(dockerRoot, "compose.yml");
const applicationComposeFile = join(dockerRoot, "compose.app.yml");
const testComposeFile = join(dockerRoot, "compose.test.yml");
const developmentExample = join(dockerRoot, ".env.development.example");
const testExample = join(dockerRoot, ".env.test.example");

const steps = [
  [
    "compose",
    "-f",
    infrastructureComposeFile,
    "pull",
    "postgres",
    "redis",
    "minio"
  ],
  [
    "compose",
    "--env-file",
    developmentExample,
    "-f",
    infrastructureComposeFile,
    "-f",
    applicationComposeFile,
    "build",
    "backend",
    "frontend"
  ],
  [
    "compose",
    "--project-name",
    "worksync-test",
    "--env-file",
    testExample,
    "-f",
    testComposeFile,
    "build",
    "backend-test",
    "frontend-e2e"
  ]
];

let activeChild;
let interruptedSignal;

function executeDocker(arguments_, environment = process.env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", arguments_, {
      cwd: repositoryRoot,
      env: environment,
      shell: false,
      stdio: "inherit",
      windowsHide: true
    });
    activeChild = child;

    child.once("error", rejectPromise);
    child.once("close", (code) => {
      if (activeChild === child) {
        activeChild = undefined;
      }
      if (code === 0) {
        resolvePromise();
        return;
      }

      const error = new Error(
        `docker ${arguments_.join(" ")} failed with exit code ${code}`
      );
      error.exitCode = typeof code === "number" ? code : 1;
      rejectPromise(error);
    });
  });
}

function handleSignal(signal) {
  interruptedSignal = interruptedSignal || signal;
  if (activeChild && !activeChild.killed) {
    activeChild.kill();
  }
}

async function main() {
  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));

  for (const [index, arguments_] of steps.entries()) {
    const environment =
      index === 2
        ? {
            ...process.env,
            WORKSYNC_DOCKER_TEST_ENV_FILE: ".env.test.example"
          }
        : process.env;
    await executeDocker(arguments_, environment);
  }

  process.stdout.write(
    "WorkSync development and test images are prepared; no containers were created\n"
  );
}

main().catch((error) => {
  if (interruptedSignal) {
    process.exitCode = interruptedSignal === "SIGINT" ? 130 : 143;
    return;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = error.exitCode || 1;
});
