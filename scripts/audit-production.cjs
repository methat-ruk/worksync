#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { scannerPath, verifyBinary } = require("./setup-osv-scanner.cjs");

const root = path.resolve(__dirname, "..");
const inventoryArguments = ["list", "-r", "--prod", "--depth", "Infinity", "--lockfile-only", "--json"];
const auditArguments = [
  "scan", "source", "--lockfile=pnpm-lock.yaml", "--format=json",
  "--all-packages", "--all-vulns", "--no-call-analysis",
  "--config=scripts/osv-scanner.toml",
];
const processTimeoutMs = 120_000;

function productionPackages(projects) {
  if (!Array.isArray(projects) || projects.length === 0) throw new Error("Missing workspace inventory.");
  if (projects.some((project) => typeof project.path !== "string" || !path.isAbsolute(project.path))) {
    throw new Error("Invalid workspace identity.");
  }
  const workspaces = new Set(projects.map((project) => project.path));
  const packages = new Set();
  function visit(node) {
    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const [alias, dep] of Object.entries(node[field] ?? {})) {
        if (typeof dep.version !== "string") throw new Error("Missing dependency version.");
        if (dep.version.startsWith("link:")) {
          if (!workspaces.has(dep.path)) throw new Error("Unresolved local dependency.");
        } else {
          const name = dep.from ?? alias;
          if (!/^(@[^/\s]+\/)?[^/@\s]+$/.test(name) ||
              !/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(dep.version)) {
            throw new Error("Unsupported dependency identity; audit coverage cannot be established.");
          }
          packages.add(`${name}@${dep.version}`);
        }
        visit(dep);
      }
    }
  }
  projects.forEach(visit);
  if (packages.size === 0) throw new Error("Empty production inventory.");
  return packages;
}

function classifyAudit(result, required) {
  const incomplete = (reason) => ({
    exitCode: 2,
    message: `Dependency audit incomplete: ${reason}. No security verdict; do not bypass this gate.`,
  });
  if (result.error || result.signal || ![0, 1].includes(result.status)) {
    return incomplete("OSV process/network failure");
  }
  try {
    if (!(required instanceof Set) || required.size === 0) throw new Error("empty inventory");
    const report = JSON.parse(result.stdout);
    if (report.error || !Array.isArray(report.results) || report.results.length !== 1 ||
        report.results[0].source?.type !== "lockfile" ||
        path.basename(report.results[0].source?.path ?? "") !== "pnpm-lock.yaml" ||
        !Array.isArray(report.results[0].packages)) {
      throw new Error("unexpected report source");
    }
    const seen = new Set();
    const findings = [];
    let totalAdvisories = 0;
    for (const entry of report.results[0].packages) {
      const pkg = entry.package;
      if (pkg?.ecosystem !== "npm" || !pkg.name || !pkg.version) throw new Error("invalid package");
      const key = `${pkg.name}@${pkg.version}`;
      seen.add(key);
      const vulnerabilities = entry.vulnerabilities === undefined ? [] : entry.vulnerabilities;
      if (!Array.isArray(vulnerabilities)) throw new Error("invalid advisories");
      totalAdvisories += vulnerabilities.length;
      if (!required.has(key)) continue;
      for (const vuln of vulnerabilities) {
        if (typeof vuln.id !== "string") throw new Error("missing advisory identity");
        const group = entry.groups?.find((value) => value.ids?.includes(vuln.id));
        const score = group?.max_severity;
        const numeric = typeof score === "string" && /^\d+(\.\d+)?$/.test(score) ? Number(score) : NaN;
        const severity = vuln.database_specific?.severity?.toUpperCase();
        const knownScore = Number.isFinite(numeric) && numeric >= 0 && numeric <= 10;
        const knownLabel = ["LOW", "MODERATE", "MEDIUM", "HIGH", "CRITICAL"].includes(severity);
        // Unknown severity requires review; it must never silently become LOW.
        if ((!knownScore && !knownLabel) || (knownScore && numeric >= 4) ||
            ["MODERATE", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) {
          findings.push(`${key}: ${vuln.id} (${severity ?? (knownScore ? numeric : "unknown severity")})`);
        }
      }
    }
    const missing = [...required].filter((key) => !seen.has(key));
    if (missing.length) throw new Error(`missing ${missing.length} production package(s)`);
    if (result.status === 1 && totalAdvisories === 0) throw new Error("unexplained scanner failure");
    if (findings.length) return {
      exitCode: 1,
      message: `Dependency audit failed: ${findings.length} blocking production advisory matches.\n${findings.join("\n")}`,
    };
    return {
      exitCode: 0,
      message: `Dependency audit passed: ${required.size}/${required.size} production package-versions covered (${seen.size} total scanned); no moderate-or-higher or unknown-severity production findings.`,
    };
  } catch (error) {
    return incomplete(`invalid or partial report (${error.message})`);
  }
}

function runAudit(run = spawnSync) {
  const options = { cwd: root, encoding: "utf8", killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024 };
  const inventory = run("pnpm", inventoryArguments, { ...options, timeout: 30_000 });
  if (inventory.error || inventory.signal || inventory.status !== 0) throw new Error("pnpm production inventory failed.");
  const required = productionPackages(JSON.parse(inventory.stdout));
  const result = run(scannerPath(), auditArguments, { ...options, timeout: processTimeoutMs });
  return { result, verdict: classifyAudit(result, required) };
}

if (require.main === module) {
  try {
    // Do not leave an earlier successful report beside a failed rerun.
    fs.rmSync(path.join(root, "test-results/dependency-audit.json"), { force: true });
    verifyBinary(fs.readFileSync(scannerPath()));
    console.log("Auditing production dependencies with pinned OSV-Scanner; 30s inventory + 120s scan limits.");
    const { result, verdict } = runAudit();
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) {
      fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
      fs.writeFileSync(path.join(root, "test-results/dependency-audit.json"), result.stdout);
    }
    console.log(verdict.message);
    process.exitCode = verdict.exitCode;
  } catch (error) {
    console.error(`Dependency audit incomplete: ${error.message} Run pnpm setup:audit and retry.`);
    process.exitCode = 2;
  }
}

module.exports = { inventoryArguments, auditArguments, processTimeoutMs, productionPackages, classifyAudit, runAudit };
