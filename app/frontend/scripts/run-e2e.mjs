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

let server;
let ownsServer = false;
let serverFailure;

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

function stopServer() {
  if (!server || !ownsServer) {
    return;
  }
  if (process.platform === "win32") {
    const connections = spawnSync("netstat", ["-ano"], {
      encoding: "utf8",
      windowsHide: true
    }).stdout;
    const match = /^\s*TCP\s+\S+:3000\s+\S+\s+LISTENING\s+(\d+)/m.exec(
      connections
    );
    const processId = match?.[1] ?? String(server.pid);
    spawnSync("taskkill", ["/pid", processId, "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    return;
  }
  if (server.exitCode === null) {
    process.kill(-server.pid, "SIGTERM");
  }
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

process.once("SIGINT", () => {
  stopServer();
  process.exit(0);
});
process.once("SIGTERM", () => {
  stopServer();
  process.exit(0);
});

try {
  await main();
} finally {
  stopServer();
}
