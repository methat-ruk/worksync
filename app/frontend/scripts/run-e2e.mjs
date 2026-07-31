import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { isHttpEndpointReady } from "./health-probe.mjs";

const frontendRoot = process.cwd();
const nextCli = path.join(frontendRoot, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(
  frontendRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);
const serverUrl = "http://localhost:3000";
const startupTimeoutMs = 120_000;
const cleanupTimeoutMs = 10_000;

let server;
let ownsServer = false;
let serverFailure;
let cleanupPromise;

async function waitForServer() {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (serverFailure) {
      throw new Error(`Frontend ${serverFailure}`);
    }
    if (await isHttpEndpointReady(serverUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Frontend did not become ready within ${startupTimeoutMs}ms`);
}

function waitForServerExit() {
  if (!server || server.exitCode !== null) {
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
      server.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), cleanupTimeoutMs);
    server.once("exit", onExit);
  });
}

async function waitForServerToStopResponding() {
  const deadline = Date.now() + cleanupTimeoutMs;
  while (Date.now() < deadline) {
    if (!(await isHttpEndpointReady(serverUrl))) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

function stopServer() {
  if (cleanupPromise) {
    return cleanupPromise;
  }
  cleanupPromise = (async () => {
    if (!server || !ownsServer) {
      return;
    }
    const errors = [];
    let processTreeCleanupFailure;
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") {
        const result = spawnSync(
          "taskkill",
          ["/pid", String(server.pid), "/t", "/f"],
          {
            encoding: "utf8",
            timeout: cleanupTimeoutMs,
            windowsHide: true
          }
        );
        if (result.error || result.status !== 0) {
          processTreeCleanupFailure =
            result.error?.message ||
            result.stderr?.trim() ||
            `exit code ${result.status ?? "unknown"}`;
          server.kill();
        }
      } else {
        try {
          process.kill(-server.pid, "SIGTERM");
        } catch (error) {
          errors.push(
            `Frontend process-group cleanup failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          server.kill("SIGTERM");
        }
      }
      if (!(await waitForServerExit())) {
        errors.push(
          `Frontend did not exit within ${cleanupTimeoutMs}ms${
            processTreeCleanupFailure
              ? ` after process-tree cleanup failed: ${processTreeCleanupFailure}`
              : ""
          }`
        );
      }
    }
    if (!(await waitForServerToStopResponding())) {
      errors.push(
        `Frontend remained available after cleanup: ${serverUrl}`
      );
    }
    server.stdout?.destroy();
    server.stderr?.destroy();
    server.unref();
    if (errors.length > 0) {
      throw new Error(`Mocked E2E cleanup failed:\n- ${errors.join("\n- ")}`);
    }
  })();
  return cleanupPromise;
}

async function main() {
  if (!(await isHttpEndpointReady(serverUrl))) {
    ownsServer = true;
    server = spawn(process.execPath, [nextCli, "dev", "--port", "3000"], {
      cwd: frontendRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
        NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: "false"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    server.stdout?.on("data", (chunk) => process.stdout.write(chunk));
    server.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    server.once("error", (error) => {
      serverFailure = `failed to start: ${error.message}`;
    });
    server.once("exit", (code, signal) => {
      serverFailure = signal
        ? `exited before becoming ready (signal ${signal})`
        : `exited before becoming ready (code ${code ?? "unknown"})`;
    });
    server.unref();
    await waitForServer();
  }

  const tests = spawnSync(process.execPath, [playwrightCli, "test"], {
    cwd: frontendRoot,
    env: process.env,
    stdio: "inherit"
  });
  process.exitCode = tests.status ?? 1;
}

async function shutdown(exitCode) {
  process.exitCode = exitCode;
  await stopServer();
  process.exit(process.exitCode ?? exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

try {
  await main();
} finally {
  await stopServer();
}

process.exit(process.exitCode ?? 0);
