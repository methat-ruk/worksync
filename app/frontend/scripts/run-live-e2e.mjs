import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isHttpEndpointReady } from "./health-probe.mjs";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(frontendRoot, "..", "..");
const backendRoot = path.join(workspaceRoot, "app", "backend");
const nextCli = path.join(frontendRoot, "node_modules", "next", "dist", "bin", "next");
const nestCli = path.join(backendRoot, "node_modules", "@nestjs", "cli", "bin", "nest.js");
const backendEntry = path.join(backendRoot, "dist", "main.js");
const prismaCli = path.join(
  backendRoot,
  "node_modules",
  "prisma",
  "build",
  "index.js"
);
const playwrightCli = path.join(
  frontendRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);
const require = createRequire(import.meta.url);
const { loadTestDatabaseUrl } = require(
  path.join(workspaceRoot, "scripts", "database-environment.cjs")
);
const databaseUrl = loadTestDatabaseUrl();
const startupTimeoutMs = 120_000;
const cleanupTimeoutMs = 10_000;
const children = [];
const childFailures = new WeakMap();
const stoppingChildren = new WeakSet();
let cleanupPromise;

async function waitFor(url, label, child) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    const failure = child ? childFailures.get(child) : undefined;
    if (failure) {
      throw new Error(`${label} ${failure}`);
    }
    if (await isHttpEndpointReady(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready within ${startupTimeoutMs}ms`);
}

async function waitForBackendPortToBeFree() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const backendReady = await isHttpEndpointReady(
      "http://localhost:4000/health/live"
    );
    if (!backendReady) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Port 4000 must be free for live auth E2E");
}

function forwardChildOutput(child, label) {
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
}

function start(label, command, args, options, healthUrl) {
  const child = spawn(command, args, {
    ...options,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  forwardChildOutput(child, label);
  child.once("error", (error) => {
    childFailures.set(child, `failed to start: ${error.message}`);
  });
  child.once("exit", (code, signal) => {
    if (stoppingChildren.has(child)) {
      return;
    }
    childFailures.set(
      child,
      signal
        ? `exited before becoming ready (signal ${signal})`
        : `exited before becoming ready (code ${code ?? "unknown"})`
    );
  });
  children.push({ child, label, healthUrl });
  return child;
}

function runOrThrow(label, command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: "inherit"
  });
  if (result.error) {
    throw new Error(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed (code ${result.status ?? "unknown"})`);
  }
}

function waitForChildExit(child) {
  if (child.exitCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), cleanupTimeoutMs);
    child.once("exit", onExit);
  });
}

async function waitForUnavailable(url) {
  const deadline = Date.now() + cleanupTimeoutMs;
  while (Date.now() < deadline) {
    if (!(await isHttpEndpointReady(url))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function stop({ child, label, healthUrl }) {
  const errors = [];
  let processTreeCleanupFailure;
  if (child.pid && child.exitCode === null) {
    stoppingChildren.add(child);
    if (process.platform === "win32") {
      const result = spawnSync(
        "taskkill",
        ["/pid", String(child.pid), "/t", "/f"],
        {
          encoding: "utf8",
          timeout: cleanupTimeoutMs,
          windowsHide: true
        }
      );
      if (result.error || result.status !== 0) {
        const detail =
          result.error?.message ||
          result.stderr?.trim() ||
          `exit code ${result.status ?? "unknown"}`;
        processTreeCleanupFailure = detail;
        child.kill();
      }
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        errors.push(
          `${label} process-group cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        child.kill("SIGTERM");
      }
    }

    if (!(await waitForChildExit(child))) {
      errors.push(
        `${label} did not exit within ${cleanupTimeoutMs}ms${
          processTreeCleanupFailure
            ? ` after process-tree cleanup failed: ${processTreeCleanupFailure}`
            : ""
        }`
      );
    }
  }
  if (healthUrl && !(await waitForUnavailable(healthUrl))) {
    errors.push(
      `${label} health endpoint remained available after cleanup: ${healthUrl}`
    );
  }

  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
  return errors;
}

function stopChildren() {
  if (cleanupPromise) {
    return cleanupPromise;
  }
  cleanupPromise = (async () => {
    const errors = [];
    for (const entry of [...children].reverse()) {
      errors.push(...(await stop(entry)));
    }
    if (errors.length > 0) {
      process.stderr.write(
        `Live E2E cleanup failed:\n${errors
          .map((error) => `- ${error}`)
          .join("\n")}\n`
      );
      process.exitCode = 1;
    }
  })();
  return cleanupPromise;
}

async function main() {
  await waitForBackendPortToBeFree();
  const reuseFrontend = await isHttpEndpointReady("http://localhost:3000");

  runOrThrow(
    "Prisma client generation",
    process.execPath,
    [prismaCli, "generate"],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      }
    }
  );
  runOrThrow("Backend build", process.execPath, [nestCli, "build"], {
    cwd: backendRoot
  });

  const backend = start(
    "backend",
    process.execPath,
    [backendEntry],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: "4000",
        FRONTEND_URL: "http://localhost:3000",
        CORS_ORIGIN: "http://localhost:3000",
        DATABASE_URL: databaseUrl,
        REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
        LOG_LEVEL: "silent",
        AUTH_RATE_LIMIT_ENABLED: "false",
        TRUST_PROXY: "false",
        JWT_ACCESS_SECRET: "live-e2e-access-secret-at-least-32-bytes",
        JWT_ACCESS_EXPIRES_IN: "15m",
        JWT_REFRESH_SECRET: "live-e2e-refresh-secret-at-least-32-bytes",
        JWT_REFRESH_EXPIRES_IN: "30d",
        COOKIE_SECURE: "false",
        COOKIE_DOMAIN: "",
        GOOGLE_OAUTH_ENABLED: "false",
        EMAIL_PROVIDER: "disabled"
      }
    },
    "http://localhost:4000/health/live"
  );
  await waitFor("http://localhost:4000/health/live", "Backend", backend);

  if (!reuseFrontend) {
    const frontend = start(
      "frontend",
      process.execPath,
      [nextCli, "dev", "--port", "3000"],
      {
        cwd: frontendRoot,
        env: {
          ...process.env,
          NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
          NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: "false"
        }
      },
      "http://localhost:3000"
    );
    await waitFor("http://localhost:3000", "Frontend", frontend);
  }

  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", "--config", "playwright.live.config.ts"],
    { cwd: frontendRoot, env: process.env, stdio: "inherit" }
  );
  process.exitCode = result.status ?? 1;
}

async function shutdown(exitCode) {
  process.exitCode = exitCode;
  await stopChildren();
  process.exit(process.exitCode ?? exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

try {
  await main();
} finally {
  await stopChildren();
}

process.exit(process.exitCode ?? 0);
