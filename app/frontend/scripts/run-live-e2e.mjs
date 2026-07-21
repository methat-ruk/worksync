import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(frontendRoot, "..", "..");
const backendRoot = path.join(workspaceRoot, "app", "backend");
const nextCli = path.join(frontendRoot, "node_modules", "next", "dist", "bin", "next");
const nestCli = path.join(backendRoot, "node_modules", "@nestjs", "cli", "bin", "nest.js");
const playwrightCli = path.join(
  frontendRoot,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);
const databaseUrl = process.env.TEST_DATABASE_URL;
const startupTimeoutMs = 120_000;
const children = [];

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for live auth E2E");
}

async function isReady(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function waitFor(url, label) {
  const deadline = Date.now() + startupTimeoutMs;
  while (Date.now() < deadline) {
    if (await isReady(url)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become ready within ${startupTimeoutMs}ms`);
}

async function waitForBackendPortToBeFree() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const backendReady = await isReady("http://localhost:4000/health/live");
    if (!backendReady) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Port 4000 must be free for live auth E2E");
}

function start(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  children.push(child);
}

function stop(child) {
  if (child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
}

async function main() {
  await waitForBackendPortToBeFree();
  const reuseFrontend = await isReady("http://localhost:3000");

  start(process.execPath, [nestCli, "start"], {
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
  });
  await waitFor("http://localhost:4000/health/live", "Backend");

  if (!reuseFrontend) {
    start(process.execPath, [nextCli, "dev", "--port", "3000"], {
      cwd: frontendRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
        NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED: "false"
      }
    });
    await waitFor("http://localhost:3000", "Frontend");
  }

  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", "--config", "playwright.live.config.ts"],
    { cwd: frontendRoot, env: process.env, stdio: "inherit" }
  );
  process.exitCode = result.status ?? 1;
}

process.once("SIGINT", () => {
  children.reverse().forEach(stop);
  process.exit(0);
});
process.once("SIGTERM", () => {
  children.reverse().forEach(stop);
  process.exit(0);
});

try {
  await main();
} finally {
  children.reverse().forEach(stop);
}
