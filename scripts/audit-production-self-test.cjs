#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { test } = require("node:test");
const { auditArguments, processTimeoutMs, classifyAudit } = require("./audit-production.cjs");

function result(counts = {}, status = 0) {
  return {
    status,
    stdout: JSON.stringify({ metadata: { vulnerabilities: {
      info: 0, low: 0, moderate: 0, high: 0, critical: 0, ...counts,
    } } }),
  };
}

test("only a successful complete audit can pass", () => {
  assert.equal(classifyAudit(result()).exitCode, 0);
  assert.equal(classifyAudit(result({ low: 1 })).exitCode, 0);
  for (const severity of ["moderate", "high", "critical"]) {
    assert.equal(classifyAudit(result({ [severity]: 1 }, 1)).exitCode, 1);
    assert.equal(classifyAudit(result({ [severity]: 1 }, 0)).exitCode, 1);
  }
  for (const incomplete of [
    { status: 1, stdout: '{"error":{"code":23,"message":"timeout"}}' },
    { status: 0, stdout: '{"error":{}}' },
    { status: 0, stdout: "{}" },
    { status: 0, stdout: "null" },
    { status: 0, stdout: "not json" },
    { ...result(), error: new Error("ENOENT") },
    { ...result(), signal: "SIGKILL" },
    result({}, 1), result({}, null),
    result({ moderate: -1 }), result({ moderate: "0" }),
  ]) assert.equal(classifyAudit(incomplete).exitCode, 2);
});

test("audit preserves the production threshold and bounded native retry policy", () => {
  assert.deepEqual(auditArguments, [
    "audit", "--prod", "--audit-level=moderate", "--json",
    "--fetch-timeout=30000", "--fetch-retries=2",
    "--fetch-retry-mintimeout=10000", "--fetch-retry-maxtimeout=10000",
  ]);
  assert.equal(processTimeoutMs, 120_000);
});

async function runWithRegistry(t, respond) {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests += 1;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/-/npm/v1/security/advisories/bulk");
    req.resume();
    respond(res, requests);
  });
  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  // Exercise the real pinned pnpm client, shortening only the retry budget.
  const args = auditArguments.map((arg) => arg
    .replace("--fetch-timeout=30000", "--fetch-timeout=300")
    .replace("--fetch-retry-mintimeout=10000", "--fetch-retry-mintimeout=10")
    .replace("--fetch-retry-maxtimeout=10000", "--fetch-retry-maxtimeout=10"));
  args.push(`--registry=http://127.0.0.1:${server.address().port}`);
  const child = spawn("pnpm", args, {
    cwd: require("node:path").resolve(__dirname, ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  const completed = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
  return { ...completed, requests, verdict: classifyAudit(completed) };
}

function json(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

test("real pnpm passes a clean registry report", { timeout: 10_000 }, async (t) => {
  const actual = await runWithRegistry(t, (res) => json(res, {}));
  assert.equal(actual.verdict.exitCode, 0, actual.stdout + actual.stderr);
  assert.equal(actual.requests, 1);
});

test("real pnpm blocks vulnerable production dependencies without retry", { timeout: 10_000 }, async (t) => {
  const actual = await runWithRegistry(t, (res) => json(res, {
    // busboy is a production dependency of the backend in this workspace.
    busboy: [{
      id: 123456, name: "busboy", severity: "moderate", title: "Test advisory",
      url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx",
      vulnerable_versions: "*", cwe: [], cvss: { score: 5, vectorString: null },
    }],
  }));
  assert.equal(actual.verdict.exitCode, 1, actual.stdout + actual.stderr);
  assert.equal(actual.requests, 1);
});

test("real pnpm recovers after a transient registry failure", { timeout: 10_000 }, async (t) => {
  const actual = await runWithRegistry(t, (res, count) => json(res, {}, count === 1 ? 503 : 200));
  assert.equal(actual.verdict.exitCode, 0, actual.stdout + actual.stderr);
  assert.equal(actual.requests, 2);
});

test("real pnpm fails closed after three unavailable responses", { timeout: 10_000 }, async (t) => {
  const actual = await runWithRegistry(t, (res) => json(res, {}, 503));
  assert.equal(actual.verdict.exitCode, 2, actual.stdout + actual.stderr);
  assert.equal(actual.requests, 3);
});

test("real pnpm fails closed after three timed-out requests", { timeout: 10_000 }, async (t) => {
  const actual = await runWithRegistry(t, () => {});
  assert.equal(actual.verdict.exitCode, 2, actual.stdout + actual.stderr);
  assert.equal(actual.requests, 3);
});

test("real pnpm fails closed on malformed registry JSON", { timeout: 10_000 }, async (t) => {
  const actual = await runWithRegistry(t, (res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("invalid-json");
  });
  assert.equal(actual.verdict.exitCode, 2, actual.stdout + actual.stderr);
});
