#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Three requests of at most 30s, with two 10s delays: 110s plus startup.
const auditArguments = [
  "audit",
  "--prod",
  "--audit-level=moderate",
  "--json",
  "--fetch-timeout=30000",
  "--fetch-retries=2",
  "--fetch-retry-mintimeout=10000",
  "--fetch-retry-maxtimeout=10000",
];
const processTimeoutMs = 120_000;

function classifyAudit(result) {
  const incomplete = {
    exitCode: 2,
    message:
      "Dependency audit incomplete: registry/network or audit-tool failure. " +
      "No security verdict is available. Restore registry connectivity and rerun; do not bypass this gate.",
  };
  if (result.error || result.signal || result.status === null) return incomplete;

  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return incomplete;
  }
  const counts = report?.metadata?.vulnerabilities;
  const severities = ["info", "low", "moderate", "high", "critical"];
  if (
    report?.error || !counts ||
    !severities.every(
      (severity) => Number.isSafeInteger(counts[severity]) && counts[severity] >= 0,
    )
  ) return incomplete;

  if (["moderate", "high", "critical"].some((severity) => counts[severity] > 0)) {
    return {
      exitCode: 1,
      message:
        "Dependency audit failed: moderate-or-higher production vulnerabilities found. " +
        "Review the report and remediate dependencies.",
    };
  }
  if (result.status !== 0) return incomplete;
  return {
    exitCode: 0,
    message: "Dependency audit passed: no moderate-or-higher production vulnerabilities found.",
  };
}

if (require.main === module) {
  console.log("Auditing production dependencies: up to 3 requests (30s each), 10s retry delays, 120s total process limit.");
  const result = spawnSync("pnpm", auditArguments, {
    cwd: path.resolve(__dirname, ".."),
    encoding: "utf8",
    timeout: processTimeoutMs,
    killSignal: "SIGKILL",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const verdict = classifyAudit(result);
  console.log(verdict.message);
  process.exitCode = verdict.exitCode;
}

module.exports = { auditArguments, processTimeoutMs, classifyAudit };
