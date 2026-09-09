"use strict";

// Disposable provider-shaped fixture; Docker and OpenSSL are required, never skipped.
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync, rmSync, chmodSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRequire } = require("node:module");
const { once } = require("node:events");
const { createServer } = require("node:net");
const { loadTestDatabaseUrl } = require("./database-environment.cjs");
const backendRequire = createRequire(resolve(__dirname, "../app/backend/package.json"));
const { Redis } = backendRequire("ioredis");
const { Queue, Worker } = backendRequire("bullmq");
let stage = "setup";

async function main() {
  const directory = mkdtempSync(join(tmpdir(), "worksync-jobs-redis-"));
  const container = `worksync-jobs-test-${randomUUID()}`;
  const prefix = "jobs-security-test";
  const clients = [];
  let queue;
  let worker;
  let workerProcess;
  let created = false;
  const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }).trim();
  function connect(options) {
    const client = new Redis({ lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1, retryStrategy: () => null, ...options });
    client.on("error", () => undefined); clients.push(client); return client;
  }
  async function ready(options) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const client = connect(options);
      try { await client.connect(); return client; } catch {
        client.disconnect();
        if (attempt === 29) {
          process.stderr.write(docker("logs", "--tail", "25", container));
          throw new Error("TLS fixture did not become ready");
        }
        await new Promise((done) => setTimeout(done, 100));
      }
    }
  }
  try {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(directory, "key.pem"),
      "-out", join(directory, "cert.pem")], { stdio: "pipe", timeout: 15000 });
    // Generated throwaway fixture only; Redis runs as an unprivileged container user.
    chmodSync(directory, 0o755);
    chmodSync(join(directory, "key.pem"), 0o644);
    // Script/Lua and connection discovery are explicit; unrelated keys/admin remain denied.
    // Redis 7 AOF transaction replay uses default-user permissions even with login
    // disabled. Keep replay permissions but test that default cannot authenticate.
    writeFileSync(join(directory, "users.acl"), `user default off ~* &* +@all\nuser jobs on >fixture-password ~${prefix}:* &${prefix}:* +@all -@admin -@dangerous +info +eval +evalsha +script|load +script|exists +client|setname +client|setinfo\n`);
    docker("run", "--detach", "--name", container, "--publish", "127.0.0.1::6379", "--mount", `type=bind,src=${directory},dst=/fixture,readonly`,
      "redis:7-alpine", "redis-server", "--port", "0", "--tls-port", "6379", "--tls-cert-file", "/fixture/cert.pem", "--tls-key-file", "/fixture/key.pem",
      "--tls-ca-cert-file", "/fixture/cert.pem", "--tls-auth-clients", "no", "--aclfile", "/fixture/users.acl", "--appendonly", "yes", "--appendfsync", "always", "--maxmemory-policy", "noeviction");
    created = true;
    const mapping = docker("port", container, "6379/tcp");
    const options = { host: "127.0.0.1", port: Number(mapping.split(":").pop()), username: "jobs", password: "fixture-password",
      tls: { ca: readFileSync(join(directory, "cert.pem")), servername: "localhost", rejectUnauthorized: true } };
    // A just-created container may not yet be listening; bound readiness retries.
    const client = await ready(options);
    stage = "ACL negative checks";
    assert.equal(await client.ping(), "PONG");
    await assert.rejects(client.set("unrelated:key", "blocked"), /NOPERM/);
    await assert.rejects(client.config("SET", "maxmemory-policy", "allkeys-lru"), /NOPERM/);
    stage = "TLS negative checks";
    await assert.rejects(connect({ ...options, password: "wrong" }).connect());
    await assert.rejects(connect({ ...options, username: "default", password: "fixture-password" }).connect());
    await assert.rejects(connect({ ...options, tls: { ...options.tls, servername: "wrong.invalid" } }).connect());
    await assert.rejects(connect({ ...options, tls: { servername: "localhost", rejectUnauthorized: true } }).connect());
    stage = "queue enqueue";
    queue = new Queue("auth-session-maintenance-v1", { connection: client, prefix });
    queue.on("error", () => undefined);
    const job = await queue.add("auth-session-cleanup", { type: "auth-session-cleanup", version: 1 }, { jobId: "persisted" });
    assert.ok(await queue.getJob(job.id));
    await queue.close(); queue = undefined; client.disconnect();
    stage = "AOF restart";
    docker("restart", container);
    options.port = Number(docker("port", container, "6379/tcp").split(":").pop());
    const restoredClient = await ready(options);
    queue = new Queue("auth-session-maintenance-v1", { connection: restoredClient, prefix });
    queue.on("error", () => undefined);
    if (!await queue.getJob(job.id)) {
      process.stderr.write(docker("logs", "--tail", "30", container));
      throw new Error("Acknowledged job absent after AOF restart");
    }
    stage = "worker consumption";
    worker = new Worker("auth-session-maintenance-v1", async () => ({ completed: true }), { connection: { ...options, maxRetriesPerRequest: null }, prefix });
    worker.on("error", () => undefined);
    const started = Date.now();
    while (await jobState(queue) !== "completed") {
      if (Date.now() - started > 10000) throw new Error("TLS/ACL BullMQ execution failed");
      await new Promise((done) => setTimeout(done, 25));
    }
    await worker.close(); worker = undefined;
    await queue.close(); queue = undefined;
    restoredClient.disconnect();

    stage = "worker Redis disconnect and recovery";
    const databaseUrl = process.env.DATABASE_URL ?? loadTestDatabaseUrl({ allowDefault: true });
    if (!new URL(databaseUrl).pathname.endsWith("_test")) throw new Error("Worker fixture requires a test database");
    const healthPort = await availablePort();
    workerProcess = spawn(process.execPath, [resolve(__dirname, "../app/backend/dist/worker.js")], {
      cwd: resolve(__dirname, "../app/backend"), stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH, NODE_ENV: "test", LOG_LEVEL: "silent",
        JOBS_DATABASE_URL: databaseUrl,
        JOBS_REDIS_URL: `rediss://jobs:fixture-password@localhost:${options.port}`,
        JOBS_REDIS_CA_FILE: join(directory, "cert.pem"), JOBS_QUEUE_PREFIX: prefix,
        JOBS_SCHEDULER_ENABLED: "false", JOBS_SESSION_CLEANUP_MODE: "dry-run", JOBS_HEALTH_PORT: String(healthPort)
      }
    });
    let workerOutput = "";
    workerProcess.stdout.on("data", (chunk) => { workerOutput += chunk; });
    workerProcess.stderr.on("data", (chunk) => { workerOutput += chunk; });
    const healthUrl = `http://127.0.0.1:${healthPort}/health/ready`;
    await healthEventually(healthUrl, true, 20000);
    docker("pause", container);
    await healthEventually(healthUrl, false, 20000);
    docker("unpause", container);
    await healthEventually(healthUrl, true, 30000);
    const recoveryClient = await ready(options);
    queue = new Queue("auth-session-maintenance-v1", { connection: recoveryClient, prefix });
    queue.on("error", () => undefined);
    const recoveryJob = await queue.add("auth-session-cleanup", { type: "auth-session-cleanup", version: 1 }, { jobId: "worker-recovery" });
    await jobStateEventually(queue, recoveryJob.id, "completed", 10000);
    await queue.close(); queue = undefined;
    recoveryClient.disconnect();
    const exited = once(workerProcess, "exit");
    const stoppingAt = Date.now();
    workerProcess.kill("SIGTERM");
    const [exitCode] = await exited;
    workerProcess = undefined;
    assert.equal(exitCode, 0);
    assert.ok(Date.now() - stoppingAt < 32000, "Worker shutdown exceeded the hard deadline");
    assert.doesNotMatch(workerOutput, /fixture-password|postgresql:\/\//);
    process.stdout.write("Jobs Redis TLS/ACL/AOF: PASS (auth, hostname/CA rejection, namespace/admin denial, durable queue restart, worker recovery and consumption)\n");
  } finally {
    if (workerProcess?.exitCode === null) {
      const exited = once(workerProcess, "exit");
      workerProcess.kill("SIGKILL"); await exited;
    }
    await worker?.close(true); await queue?.close();
    for (const client of clients) client.disconnect();
    if (created) docker("rm", "--force", "--volumes", container);
    rmSync(directory, { recursive: true, force: true });
  }
}
async function jobState(queue) { return (await queue.getJob("persisted"))?.getState(); }
async function jobStateEventually(queue, jobId, expectedState, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await (await queue.getJob(jobId))?.getState() === expectedState) return;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw new Error(`Worker did not reach ${expectedState} after Redis recovery`);
}
async function healthEventually(url, expectedReady, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok === expectedReady) return;
    } catch {
      if (!expectedReady) return;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Worker readiness did not become ${expectedReady ? "ready" : "unready"}`);
}
async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve worker health port");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}
main().catch((error) => { process.stderr.write(`Jobs Redis TLS/ACL/AOF fixture failed at ${stage}: ${String(error.message).replaceAll("fixture-password", "[test credential]").slice(0, 1500)}\n`); process.exitCode = 1; });
