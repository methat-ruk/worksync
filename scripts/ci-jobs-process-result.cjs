"use strict";

const { readFileSync } = require("node:fs");
const path = require("node:path");

const JOBS_PROCESS_SUITE = "app/backend/test/e2e/jobs-process.e2e.spec.ts";
const JOBS_PROCESS_TEST_NAMES = Object.freeze([
  "compiled jobs process lifecycle starts without API secrets, processes a real job and drains on repeated signals",
  "compiled jobs process lifecycle upserts one schedule across two process starts and stops without removing it",
  "compiled jobs process lifecycle fails readiness when globally paused and resumes after operator recovery",
  "compiled jobs process lifecycle recovers a committed deletion after process death before queue acknowledgement",
  "compiled jobs process lifecycle preserves data and redelivers after process death before the handler commits",
  "compiled jobs process lifecycle moves a repeatedly abandoned job to failed after stall exhaustion",
  "compiled jobs process lifecycle terminates an unsettled handler at the hard attempt deadline",
  "compiled jobs process lifecycle bounds shutdown while an active handler cannot settle",
  "compiled jobs process lifecycle exits within the bootstrap deadline while Redis is disconnected"
]);

function normalizeSuitePath(suitePath) {
  const normalized = suitePath.replaceAll("\\", "/");
  const marker = "app/backend/test/";
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex === -1) throw new Error(`Unexpected jobs suite path: ${suitePath}`);
  return normalized.slice(markerIndex);
}

function validateJobsProcessReport(
  report,
  { expectedTests = JOBS_PROCESS_TEST_NAMES, allowPending = false } = {}
) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Jobs process report is not an object");
  }
  for (const field of [
    "numFailedTestSuites",
    "numFailedTests",
    "numPendingTestSuites",
    "numPendingTests",
    "numTodoTests",
    "numRuntimeErrorTestSuites"
  ]) {
    if (field === "numPendingTests" && allowPending) {
      if (!Number.isInteger(report[field]) || report[field] < 0) {
        throw new Error(`Jobs process report has invalid ${field}=${report[field]}`);
      }
    } else if (report[field] !== 0) {
      throw new Error(`Jobs process report has ${field}=${report[field]}`);
    }
  }
  if (report.success !== true || report.wasInterrupted === true) {
    throw new Error("Jobs process tests did not complete successfully");
  }
  if (
    !Array.isArray(report.testResults) ||
    report.testResults.length !== 1 ||
    report.numTotalTestSuites !== 1 ||
    report.numPassedTestSuites !== 1
  ) {
    throw new Error("Jobs process report must contain exactly one executed suite");
  }
  const suite = report.testResults[0];
  if (!suite || typeof suite.name !== "string" || typeof suite.status !== "string") {
    throw new Error("Jobs process report suite identity is invalid");
  }
  const completeSuite = suite.status === "passed";
  const focusedSuite = allowPending && suite.status === "focused";
  if (normalizeSuitePath(suite.name) !== JOBS_PROCESS_SUITE || (!completeSuite && !focusedSuite)) {
    throw new Error("Jobs process report contains an unexpected or failed suite");
  }
  const passedTests = suite.assertionResults?.filter((result) => result.status === "passed") ?? [];
  const passedNames = new Set(passedTests.map((result) => result.fullName));
  const expectedNames = new Set(expectedTests);
  if (
    !Array.isArray(suite.assertionResults) ||
    passedNames.size !== expectedNames.size ||
    [...expectedNames].some((name) => !passedNames.has(name)) ||
    passedTests.some((result) => !expectedNames.has(result.fullName)) ||
    !Number.isInteger(report.numTotalTests) ||
    (allowPending ? report.numTotalTests < expectedNames.size : report.numTotalTests !== expectedNames.size) ||
    report.numPassedTests !== expectedNames.size
  ) {
    throw new Error("Jobs process report did not pass the expected test set");
  }
  return { suite: JOBS_PROCESS_SUITE, tests: expectedNames.size };
}

if (require.main === module) {
  const reportPath = process.argv[2];
  if (!reportPath || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/ci-jobs-process-result.cjs <report.json>");
  }
  const result = validateJobsProcessReport(
    JSON.parse(readFileSync(path.resolve(reportPath), "utf8"))
  );
  process.stdout.write(`Jobs process evidence covered ${result.tests} tests.\n`);
}

module.exports = {
  JOBS_PROCESS_SUITE,
  JOBS_PROCESS_TEST_NAMES,
  normalizeSuitePath,
  validateJobsProcessReport
};
