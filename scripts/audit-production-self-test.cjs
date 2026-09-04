#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const { productionPackages, classifyAudit, runAudit, auditArguments, processTimeoutMs } = require("./audit-production.cjs");
const { scannerPath, verifyBinary } = require("./setup-osv-scanner.cjs");

const required = new Set(["example@1.0.0"]);
function report({ severity, score, name = "example", status, extra = [] } = {}) {
  const vulnerable = severity !== undefined || score !== undefined;
  return {
    status: status ?? (vulnerable ? 1 : 0),
    stdout: JSON.stringify({ results: [{
      source: { type: "lockfile", path: "/fixture/pnpm-lock.yaml" },
      packages: [{
        package: { name, version: "1.0.0", ecosystem: "npm" },
        ...(vulnerable ? {
          vulnerabilities: [{ id: "GHSA-test", database_specific: { severity } }],
          groups: [{ ids: ["GHSA-test"], max_severity: score }],
        } : {}),
      }, ...extra],
    }] }),
  };
}

test("clean and known low severity pass, moderate/high/critical/unknown block", () => {
  assert.equal(classifyAudit(report(), required).exitCode, 0);
  for (const input of [{ severity: "LOW", score: "3.9" }, { score: "0.0" }]) {
    assert.equal(classifyAudit(report(input), required).exitCode, 0);
  }
  for (const input of [
    { severity: "MODERATE" }, { severity: "HIGH" }, { severity: "CRITICAL" },
    { score: "4.0" }, { score: "10.0" }, { score: "" }, { severity: "UNKNOWN" },
    { score: "NaN" }, { score: "11" }, { severity: "LOW", score: "7.0" },
    { severity: "HIGH", score: "1.0" },
  ]) assert.equal(classifyAudit(report(input), required).exitCode, 1);
});

test("coverage gaps, malformed output and process failures cannot pass", () => {
  for (const result of [
    { status: 0, stdout: "{}" }, { status: 0, stdout: "not json" },
    { ...report(), status: 2 }, { ...report(), status: 1 },
    { ...report(), status: null }, { ...report(), error: new Error("timeout") },
    { ...report(), signal: "SIGKILL" }, report({ name: "wrong-package" }),
  ]) assert.equal(classifyAudit(result, required).exitCode, 2);
  assert.equal(classifyAudit(report(), new Set()).exitCode, 2);
  assert.equal(classifyAudit(report(), new Set([...required, "missing@1.0.0"])).exitCode, 2);
});

test("dev-only findings remain reported without broadening the production gate", () => {
  const dev = JSON.parse(report({ name: "dev-only", severity: "HIGH" }).stdout).results[0].packages[0];
  assert.equal(classifyAudit(report({ status: 1, extra: [dev] }), required).exitCode, 0);
  assert.equal(classifyAudit(report({ status: 2, extra: [dev] }), required).exitCode, 2);
});

test("inventory includes optional, transitive, aliases and workspace consumers", () => {
  const projects = [{ path: "/app", dependencies: {
    alias: { from: "real-name", version: "1.0.0", dependencies: { child: { version: "2.0.0" } } },
    shared: { version: "link:../shared", path: "/shared" },
  }, optionalDependencies: { optional: { version: "3.0.0" } },
  devDependencies: { excluded: { version: "1.0.0" } },
  }, { path: "/shared", dependencies: { child: { version: "2.0.0" } } }];
  assert.deepEqual([...productionPackages(projects)].sort(), ["child@2.0.0", "optional@3.0.0", "real-name@1.0.0"]);
  for (const bad of [[], {}, [{ path: "/app" }], [{ path: "/app", dependencies: { bad: { version: "git:abc" } } }],
    [{ path: "/app", dependencies: { bad: { version: "link:../missing", path: "/missing" } } }]]) {
    assert.throws(() => productionPackages(bad));
  }
});

test("runner bounds inventory and scan and propagates incomplete scans", () => {
  const calls = [];
  const actual = runAudit((command, args, options) => {
    calls.push({ command, args, options });
    if (calls.length === 1) return { status: 0, stdout: JSON.stringify([
      { path: "/app", dependencies: { example: { version: "1.0.0" } } },
    ]) };
    return { status: null, error: new Error("ETIMEDOUT") };
  });
  assert.equal(actual.verdict.exitCode, 2);
  assert.equal(calls[0].options.timeout, 30_000);
  assert.equal(calls[1].options.timeout, processTimeoutMs);
  assert.equal(calls[1].options.killSignal, "SIGKILL");
  assert(calls[0].args.includes("--prod"));
  assert(calls[0].args.includes("--lockfile-only"));
  assert(calls[1].args.includes("--all-packages"));
  assert(calls[1].args.includes("--all-vulns"));
  assert.throws(() => runAudit(() => ({ status: 1 })), /inventory failed/);
});

test("tampered binary fails checksum verification", () => {
  assert.throws(() => verifyBinary(Buffer.from("not the scanner")), /checksum mismatch/);
});

// These are live scanner contract tests, not mocked advisory responses.
// They deliberately fail when OSV cannot be reached; they never skip in CI.
for (const [name, version, expected] of [["busboy", "1.6.0", 0], ["lodash", "4.17.20", 1]]) {
  test(`real pinned OSV scans ${name}@${version}`, { timeout: 130_000 }, () => {
    verifyBinary(fs.readFileSync(scannerPath()));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "worksync-audit-contract-"));
    try {
      const lockfile = path.join(directory, "pnpm-lock.yaml");
      fs.writeFileSync(lockfile, `lockfileVersion: '9.0'\npackages:\n  ${name}@${version}: {}\nsnapshots:\n  ${name}@${version}: {}\n`);
      const args = auditArguments.map((arg) => arg.startsWith("--lockfile=") ? `--lockfile=${lockfile}` : arg);
      const actual = spawnSync(scannerPath(), args, {
        cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: processTimeoutMs,
        killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(classifyAudit(actual, new Set([`${name}@${version}`])).exitCode, expected,
        actual.stderr + actual.stdout);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}
