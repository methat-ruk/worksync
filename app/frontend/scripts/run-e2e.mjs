import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

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

async function isReady() {
  try {
    const response = await fetch(serverUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await isReady()) {
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
  if (!(await isReady())) {
    ownsServer = true;
    server = spawn(process.execPath, [nextCli, "dev", "--port", "3000"], {
      cwd: frontendRoot,
      detached: true,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
        NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: "false"
      },
      stdio: "ignore"
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
