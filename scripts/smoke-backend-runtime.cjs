const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { createServer } = require("node:net");
const { join, resolve } = require("node:path");

const repositoryRoot = resolve(__dirname, "..");
const backendRoot = join(repositoryRoot, "app", "backend");
const runtimeEntry = join(backendRoot, "dist", "main.js");
const dotenv = require(join(backendRoot, "node_modules", "dotenv"));

dotenv.config({
  path: join(backendRoot, ".env"),
  override: false,
  quiet: true
});

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a runtime smoke-test port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitForHealthy(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("Backend runtime exited before becoming healthy");
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // Startup connection failures are expected until the listener is ready.
    }
    await delay(250);
  }
  throw new Error("Backend runtime did not become healthy within 15 seconds");
}

async function expectStatus(url, expectedStatus, init) {
  const response = await fetch(url, init);
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected ${expectedStatus} from ${new URL(url).pathname}, received ${response.status}`
    );
  }
  return response;
}

async function main() {
  if (!existsSync(runtimeEntry)) {
    throw new Error(
      "Backend runtime artifact is missing; run the backend build first"
    );
  }
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required for backend runtime smoke");
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [runtimeEntry], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      FRONTEND_URL: process.env.FRONTEND_URL ?? "http://localhost:3000",
      CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3000",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      LOG_LEVEL: "silent",
      JWT_ACCESS_SECRET:
        process.env.JWT_ACCESS_SECRET ??
        "runtime-smoke-access-secret-at-least-32-bytes",
      JWT_ACCESS_EXPIRES_IN:
        process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
      JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET ??
        "runtime-smoke-refresh-secret-at-least-32-bytes",
      JWT_REFRESH_EXPIRES_IN:
        process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
      COOKIE_SECURE: "false",
      GOOGLE_OAUTH_ENABLED: "false"
    },
    stdio: "ignore"
  });

  try {
    await waitForHealthy(baseUrl, child);
    await expectStatus(`${baseUrl}/docs`, 200);

    const google = await expectStatus(
      `${baseUrl}/api/auth/google`,
      503
    );
    const googleBody = await google.json();
    if (googleBody?.data?.code !== "GOOGLE_OAUTH_NOT_CONFIGURED") {
      throw new Error("Google OAuth disabled-route contract changed");
    }

    const refresh = await expectStatus(
      `${baseUrl}/api/auth/refresh`,
      401,
      { method: "POST" }
    );
    const refreshBody = await refresh.json();
    if (refreshBody?.data?.code !== "REFRESH_TOKEN_REQUIRED") {
      throw new Error("Refresh missing-cookie contract changed");
    }

    process.stdout.write(
      "Backend runtime smoke passed (health, docs, Google disabled route, refresh contract)\n"
    );
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Backend runtime smoke failed"}\n`
  );
  process.exitCode = 1;
});
