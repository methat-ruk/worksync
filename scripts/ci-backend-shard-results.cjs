"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const serviceTestRoot = path.join(repositoryRoot, "app", "backend", "test");
const serviceProjects = ["integration", "contract", "security", "e2e"];

function collectSpecFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSpecFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".spec.ts") ? [entryPath] : [];
  });
}

function normalizeSuitePath(suitePath) {
  const normalized = suitePath.replaceAll("\\", "/");
  const marker = "app/backend/test/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Unexpected backend test path: ${suitePath}`);
  }
  return normalized.slice(markerIndex);
}

function discoverServiceSuites() {
  return serviceProjects
    .flatMap((project) => collectSpecFiles(path.join(serviceTestRoot, project)))
    .map((suitePath) =>
      path.relative(repositoryRoot, suitePath).replaceAll("\\", "/")
    )
    .sort();
}

function validateShardReports(expectedSuites, reports) {
  if (reports.length !== 2) {
    throw new Error(`Expected 2 backend shard reports, received ${reports.length}`);
  }

  const executedSuites = [];
  let executedTests = 0;

  for (const [index, report] of reports.entries()) {
    const shard = index + 1;
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      throw new Error(`Backend shard ${shard} report is not an object`);
    }
    if (report.success !== true) {
      throw new Error(`Backend shard ${shard} did not report success`);
    }
    for (const field of [
      "numFailedTestSuites",
      "numFailedTests",
      "numPendingTestSuites",
      "numPendingTests",
      "numTodoTests",
      "numRuntimeErrorTestSuites"
    ]) {
      if (report[field] !== 0) {
        throw new Error(`Backend shard ${shard} reported ${field}=${report[field]}`);
      }
    }
    if (!Array.isArray(report.testResults) || report.testResults.length === 0) {
      throw new Error(`Backend shard ${shard} did not execute any suites`);
    }
    if (
      report.numTotalTestSuites !== report.testResults.length ||
      report.numPassedTestSuites !== report.testResults.length
    ) {
      throw new Error(`Backend shard ${shard} suite totals are inconsistent`);
    }
    if (!Number.isInteger(report.numTotalTests) || report.numTotalTests <= 0) {
      throw new Error(`Backend shard ${shard} did not execute any tests`);
    }
    if (report.numPassedTests !== report.numTotalTests) {
      throw new Error(`Backend shard ${shard} test totals are inconsistent`);
    }
    if (report.wasInterrupted === true) {
      throw new Error(`Backend shard ${shard} was interrupted`);
    }

    for (const suite of report.testResults) {
      if (suite.status !== "passed") {
        throw new Error(
          `Backend shard ${shard} suite ${suite.name ?? "<unknown>"} did not pass`
        );
      }
      executedSuites.push(normalizeSuitePath(suite.name));
    }
    executedTests += report.numTotalTests;
  }

  const duplicateSuites = executedSuites.filter(
    (suite, index) => executedSuites.indexOf(suite) !== index
  );
  if (duplicateSuites.length > 0) {
    throw new Error(
      `Backend shard reports overlap: ${[...new Set(duplicateSuites)].join(", ")}`
    );
  }

  const expected = [...expectedSuites].sort();
  const executed = [...executedSuites].sort();
  const missing = expected.filter((suite) => !executed.includes(suite));
  const unexpected = executed.filter((suite) => !expected.includes(suite));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `Backend shard inventory mismatch; missing=[${missing.join(", ")}], ` +
        `unexpected=[${unexpected.join(", ")}]`
    );
  }

  return { suites: executed.length, tests: executedTests };
}

if (require.main === module) {
  const reportPaths = process.argv.slice(2);
  const reports = reportPaths.map((reportPath) =>
    JSON.parse(readFileSync(path.resolve(reportPath), "utf8"))
  );
  const result = validateShardReports(discoverServiceSuites(), reports);
  process.stdout.write(
    `Backend shards covered ${result.suites} service suites and ${result.tests} tests.\n`
  );
}

module.exports = {
  discoverServiceSuites,
  normalizeSuitePath,
  validateShardReports
};
